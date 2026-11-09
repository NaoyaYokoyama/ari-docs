import {
  BookOpen,
  BookText,
  CircleHelp,
  FilePlus,
  FileText,
  Folder,
  Home,
  Link2,
  LoaderCircle,
  type LucideIcon,
  Monitor,
  Moon,
  Search,
  Settings,
  SquareTerminal,
  Sun,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { quickOpen, type QuickOpenItem } from "@/api/quickOpen";
import { useApp } from "@/app/AppContext";
import { useDesktopStatus } from "@/app/DesktopContext";
import { usePreferences } from "@/app/preferences";
import { type ThemePreference, useTheme } from "@/app/theme";
import { useOpenAriLink } from "@/app/useAriLink";
import { useGuardedNavigate } from "@/app/useGuardedNavigate";
import Kbd from "@/components/common/Kbd";
import { ariLinkLabel, parseAriLink } from "@/lib/ariLink";
import { fileKind } from "@/lib/fileType";
import { visibleSettingSections } from "@/pages/setting/settingSection";
import { type FuzzyMatch, fuzzyMatch, parseQuery, type Query } from "@/quickOpen/fuzzy";
import { readRecent, type RecentEntry, recentKey, rememberOpened } from "@/quickOpen/recent";
import { type NavigationPage, shortcutLabel } from "@/shortcut/shortcut";
import { useNavigation } from "@/shortcut/useNavigation";
import { setVimSettings, useVimSettings } from "@/vim/vimSettings";

type Kind = RecentEntry["kind"] | "page" | "command" | "setting";

const KIND_LABELS: Record<Kind, string> = {
  note: "Note",
  wiki: "Wiki",
  folder: "フォルダ",
  file: "ファイル",
  page: "画面",
  command: "操作",
  setting: "設定",
};

type Entry = {
  key: string;
  kind: Kind;
  name: string;
  // 名前の横に薄く出す（入っているフォルダなど）。打った文字との一致にも使う
  location: string;
  // 名前に無くても一致させる言葉（「テーマ」で配色など）
  keywords?: string;
  shortcut?: string;
  icon: LucideIcon;
  iconClassName?: string;
  // 最近開いたものの順（0 が一番新しい）
  recent?: number;
  // Note・Wiki・ファイル・フォルダ
  content?: RecentEntry;
  run?: () => void;
};

type Row = Entry & { match: FuzzyMatch | null };

// 一度に出す数
const LIMIT = 50;
// 最近開いたもの（打つ前）に出す数
const RECENT_LIMIT = 8;
// サーバーに問い合わせるまで待つ時間（打っている間に何度も問い合わせないように）
const DEBOUNCE = 120;

const NO_MATCH: FuzzyMatch = { score: 0, name: new Set(), location: new Set() };

function contentEntry(content: RecentEntry, recent?: number): Entry {
  const folder = content.kind === "folder";
  const { icon, className } =
    content.kind === "note"
      ? { icon: FileText, className: "text-brand" }
      : content.kind === "wiki"
        ? { icon: BookOpen, className: "text-brand" }
        : fileKind(content.name, folder);
  return {
    key: recentKey(content),
    kind: content.kind,
    name: content.name,
    location: content.location,
    icon,
    iconClassName: className,
    recent,
    content,
  };
}

function fromServer(item: QuickOpenItem): RecentEntry {
  return {
    kind: item.kind,
    id: item.kind === "note" || item.kind === "wiki" ? item.id : "",
    name: item.name,
    location: item.location,
    path: item.path,
  };
}

// 打った文字に近い順に並べる。最近開いたものは少し上にする
function rank(query: Query, entries: Entry[]): Row[] {
  const rows: (Row & { score: number })[] = [];
  for (const entry of entries) {
    let match = fuzzyMatch(query, entry.location, entry.name);
    if (!match && entry.keywords) {
      const byKeyword = fuzzyMatch(query, entry.location, `${entry.name} ${entry.keywords}`);
      match = byKeyword && { ...NO_MATCH, score: Math.floor(byKeyword.score / 2) };
    }
    if (!match) {
      continue;
    }
    const bonus = entry.recent === undefined ? 0 : Math.max(0, 24 - entry.recent * 2);
    rows.push({ ...entry, match, score: match.score + bonus });
  }
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      [...a.name].length - [...b.name].length ||
      [...a.location].length - [...b.location].length ||
      a.name.localeCompare(b.name, "ja"),
  );
  return rows.slice(0, LIMIT);
}

// 一致した文字を太字にする
function Highlight({ text, marks }: { text: string; marks: Set<number> }) {
  if (marks.size === 0) {
    return text;
  }
  const parts: ReactNode[] = [];
  let run = "";
  let marked = false;
  const flush = () => {
    if (run) {
      parts.push(
        marked ? (
          <mark key={parts.length} className="bg-transparent font-semibold text-brand">
            {run}
          </mark>
        ) : (
          run
        ),
      );
    }
    run = "";
  };
  [...text].forEach((char, index) => {
    if (marks.has(index) !== marked) {
      flush();
      marked = !marked;
    }
    run += char;
  });
  flush();
  return parts;
}

type Props = {
  // 開いたときに入れておく文字（Vim のエディタの :e 議事録 など）
  initialQuery: string;
  onClose: () => void;
  onHelp: () => void;
};

// 探して開く（FN0003）。Note・Wiki・ファイル・フォルダ・画面・操作を名前で探して開く（Ctrl+P、Vim モードの o）
// 画面の名前・アイコン・探すときの言葉（出す画面と Alt+数字は useNavigation で決まる）
const PAGE_ENTRIES: Record<NavigationPage, { name: string; icon: LucideIcon; keywords: string }> = {
  home: { name: "Home", icon: Home, keywords: "ホーム 検索 お気に入り 最近" },
  folder: { name: "Folder", icon: Folder, keywords: "フォルダ ファイル" },
  note: { name: "Note", icon: FileText, keywords: "ノート メモ" },
  wiki: { name: "Wiki", icon: BookOpen, keywords: "ウィキ 共有" },
  docs: { name: "Docs", icon: BookText, keywords: "ドキュメント 設計書 markdown" },
  setting: { name: "設定", icon: Settings, keywords: "setting せってい" },
};

export default function QuickOpen({ initialQuery, onClose, onHelp }: Props) {
  const { user, showMessage } = useApp();
  const desktop = useDesktopStatus();
  const navigate = useGuardedNavigate();
  const { showHidden } = usePreferences();
  const { preference, setPreference } = useTheme();
  const vim = useVimSettings();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<QuickOpenItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recent] = useState(() => readRecent(user?.userId ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const request = useRef(0);
  // 閉じたら、開く前にいたところへ戻る（選んで画面を移ったときは移った先に任せる）
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const chosen = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    input?.focus();
    input?.select();
    const previous = returnFocus.current;
    return () => {
      if (!chosen.current && previous?.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  // ari-docs の中のリンク（ari://…。FN0004）を貼ったときは、そのリンクだけを出す（サーバーには探しに行かない）
  const ariLink = useMemo(() => parseAriLink(query), [query]);
  const openAriLink = useOpenAriLink();

  // サーバーの Note・Wiki・ノードは、打ち終わるのを少し待ってから探す。前の答えは新しい答えが来るまで並べ直して使う
  useEffect(() => {
    const keyword = query.trim();
    if (!keyword || parseAriLink(keyword)) {
      setRemote([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const id = ++request.current;
      try {
        const response = await quickOpen(keyword, showHidden);
        if (id === request.current) {
          setRemote(response.items);
          setFailed(false);
        }
      } catch (error) {
        console.error(error);
        if (id === request.current) {
          setFailed(true);
        }
      } finally {
        if (id === request.current) {
          setLoading(false);
        }
      }
    }, DEBOUNCE);
    return () => window.clearTimeout(timer);
  }, [query, showHidden]);

  // 選んだものを開く。alt（Shift+Enter）はファイル・フォルダを開かずに Folder で場所を示す
  const openContent = (content: RecentEntry, alt: boolean) => {
    rememberOpened(user?.userId, content);
    switch (content.kind) {
      case "note":
        return void navigate("/note", { state: { noteId: content.id } });
      case "wiki":
        return void navigate("/wiki", { state: { wikiId: content.id } });
      default:
        return void navigate("/folder", {
          state: { nodePath: content.path, nodeAction: alt ? "select" : "open" },
        });
    }
  };

  // 画面・操作・設定のメニュー（この画面の中で決まるもの）
  const navigation = useNavigation();
  const commands = useMemo<Entry[]>(() => {
    const page = (key: string, name: string, icon: LucideIcon, path: string, shortcut: string, keywords: string): Entry => ({
      key: `page:${key}`,
      kind: "page",
      name,
      location: "",
      keywords,
      shortcut,
      icon,
      run: () => void navigate(path),
    });
    const themes: { value: ThemePreference; name: string; icon: LucideIcon }[] = [
      { value: "light", name: "配色をライトにする", icon: Sun },
      { value: "dark", name: "配色をダークにする", icon: Moon },
      { value: "system", name: "配色を OS に合わせる", icon: Monitor },
    ];
    return [
      ...navigation.map((item) => {
        const { name, icon, keywords } = PAGE_ENTRIES[item.page];
        return page(item.page, name, icon, item.path, shortcutLabel(item.shortcut), keywords);
      }),
      {
        key: "command:new-note",
        kind: "command",
        name: "新しい Note を作る",
        location: "",
        keywords: "作成 新規 追加 ノート メモ",
        icon: FilePlus,
        run: () => void navigate("/note", { state: { create: true } }),
      },
      {
        key: "command:new-wiki",
        kind: "command",
        name: "新しい Wiki を作る",
        location: "",
        keywords: "作成 新規 追加 ウィキ",
        icon: FilePlus,
        run: () => void navigate("/wiki", { state: { create: true } }),
      },
      ...themes
        .filter((theme) => theme.value !== preference)
        .map<Entry>((theme) => ({
          key: `command:theme-${theme.value}`,
          kind: "command",
          name: theme.name,
          location: "",
          keywords: "テーマ 色 表示 ダーク ライト dark light",
          icon: theme.icon,
          run: () => setPreference(theme.value),
        })),
      {
        key: "command:shortcuts",
        kind: "command",
        name: "ショートカットの一覧",
        location: "",
        keywords: "キー キーボード ヘルプ",
        shortcut: "?",
        icon: CircleHelp,
        run: onHelp,
      },
      {
        key: "command:vim",
        kind: "command",
        name: vim.enabled ? "Vim モードをやめる" : "Vim モードを使う",
        location: "",
        keywords: "vim vimium キー オン オフ 切り替え",
        icon: SquareTerminal,
        run: () => {
          setVimSettings({ enabled: !vim.enabled });
          showMessage("info", vim.enabled ? "Vim モードをやめました" : "Vim モードにしました");
        },
      },
    ];
  }, [navigate, navigation, onHelp, preference, setPreference, showMessage, vim.enabled]);

  // 設定のメニュー（探したときだけ出す。「設定」と打てばまとめて出る）
  const settings = useMemo<Entry[]>(
    () =>
      visibleSettingSections(user, desktop).map((section) => ({
        key: `setting:${section.id}`,
        kind: "setting",
        name: section.label,
        location: "設定",
        keywords: `${section.group} ${section.keywords}`,
        icon: section.icon,
        run: () => void navigate(`/setting?section=${section.id}`),
      })),
    [desktop, navigate, user],
  );

  const recentEntries = useMemo(() => recent.map((entry, index) => contentEntry(entry, index)), [recent]);

  const parsed = useMemo(() => parseQuery(query), [query]);
  const rows = useMemo<Row[]>(() => {
    if (ariLink) {
      const location = "path" in ariLink ? ariLink.path.split("/").slice(0, -1).join("/") || "folder" : ariLink.id;
      return [
        {
          key: "link",
          kind: ariLink.kind,
          name: `リンクを開く: ${ariLinkLabel(ariLink)}`,
          location,
          icon: Link2,
          run: () => openAriLink(ariLink),
          match: null,
        },
      ];
    }
    if (!parsed) {
      return [...recentEntries.slice(0, RECENT_LIMIT), ...commands].map((entry) => ({ ...entry, match: null }));
    }
    // サーバーの答えを新しい名前として使い、最近開いた順も残す
    const byKey = new Map(recentEntries.map((entry) => [entry.key, entry]));
    for (const item of remote) {
      const content = fromServer(item);
      const key = recentKey(content);
      byKey.set(key, contentEntry(content, byKey.get(key)?.recent));
    }
    return rank(parsed, [...byKey.values(), ...commands, ...settings]);
  }, [ariLink, openAriLink, parsed, recentEntries, remote, commands, settings]);

  const current = Math.min(active, Math.max(rows.length - 1, 0));

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const choose = (row: Row | undefined, alt: boolean) => {
    if (!row) {
      return;
    }
    chosen.current = true;
    onClose();
    if (row.content) {
      openContent(row.content, alt);
    } else {
      row.run?.();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // 変換中の Enter・矢印は IME に任せる
    if (event.nativeEvent.isComposing) {
      return;
    }
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey && !event.altKey && !event.metaKey;
    let delta = 0;
    if (key === "arrowdown" || (ctrl && (key === "n" || key === "j")) || (key === "tab" && !event.shiftKey)) {
      delta = 1;
    } else if (key === "arrowup" || (ctrl && (key === "p" || key === "k")) || (key === "tab" && event.shiftKey)) {
      delta = -1;
    }
    if (delta !== 0) {
      event.preventDefault();
      if (rows.length > 0) {
        setActive((current + delta + rows.length) % rows.length);
      }
      return;
    }
    if (key === "enter") {
      event.preventDefault();
      choose(rows[current], event.shiftKey);
    } else if (key === "escape") {
      event.preventDefault();
      onClose();
    }
  };

  const recentCount = parsed ? 0 : Math.min(recentEntries.length, RECENT_LIMIT);
  const activeRow = rows[current];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 px-4 pt-[12vh] animate-in fade-in-0"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="探して開く"
        className="mx-auto flex max-h-[76vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl animate-in zoom-in-95 fade-in-0"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search size={17} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="quick-open-list"
            aria-activedescendant={activeRow ? `quick-open-${current}` : undefined}
            aria-label="探す言葉"
            placeholder="Note・Wiki・ファイル・画面・操作を名前で探す"
            spellCheck={false}
            autoComplete="off"
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {loading && <LoaderCircle size={16} className="shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <ul ref={listRef} id="quick-open-list" role="listbox" aria-label="候補" className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {rows.map((row, index) => {
            const Icon = row.icon;
            const header =
              !parsed && index === 0 && recentCount > 0
                ? "最近開いたもの"
                : !parsed && index === recentCount
                  ? "画面・操作"
                  : null;
            return (
              <li key={row.key} role="presentation">
                {header && (
                  <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{header}</div>
                )}
                <div
                  id={`quick-open-${index}`}
                  role="option"
                  aria-selected={index === current}
                  data-index={index}
                  onMouseMove={() => index !== current && setActive(index)}
                  onClick={(event) => choose(row, event.shiftKey)}
                  className={twMerge(
                    "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm",
                    index === current && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon size={16} className={twMerge("shrink-0 text-muted-foreground", row.iconClassName)} />
                  <span className="min-w-0 flex-1 truncate">
                    <Highlight text={row.name} marks={row.match?.name ?? NO_MATCH.name} />
                    {row.location && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        <Highlight text={row.location} marks={row.match?.location ?? NO_MATCH.location} />
                      </span>
                    )}
                  </span>
                  {row.shortcut ? (
                    <Kbd>{row.shortcut}</Kbd>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">{KIND_LABELS[row.kind]}</span>
                  )}
                </div>
              </li>
            );
          })}
          {parsed && rows.length === 0 && !loading && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {failed ? "探せませんでした。もう一度打ってください" : `「${query.trim()}」に合うものはありません`}
            </li>
          )}
        </ul>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑↓</Kbd>
            <Kbd>Ctrl+N/P</Kbd>
            選ぶ
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd>
            開く
          </span>
          {(activeRow?.kind === "file" || activeRow?.kind === "folder") && (
            <span className="flex items-center gap-1">
              <Kbd>Shift+Enter</Kbd>
              場所を表示
            </span>
          )}
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd>
            閉じる
          </span>
        </div>
      </div>
    </div>
  );
}
