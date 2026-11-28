import { isTauri } from "@tauri-apps/api/core";
import { RotateCcw } from "lucide-react";
import { Fragment, useState } from "react";

import { useApp } from "@/app/AppContext";
import Dialog from "@/components/common/Dialog";
import IconButton from "@/components/common/IconButton";
import Kbd from "@/components/common/Kbd";
import { VIM_ACTIONS } from "@/vim/actions";
import { displayToken, parseBinding } from "@/vim/keys";
import { useVimSettings, type VimSettings } from "@/vim/vimSettings";

import {
  comboFromEvent,
  conflictOf,
  type CustomShortcutId,
  getShortcutOverrides,
  type NavigationItem,
  setShortcutCapturing,
  setShortcutKey,
  SHORTCUT,
  type Shortcut,
  shortcutKeys,
  useShortcutVersion,
} from "./shortcut";
import { useNavigation } from "./useNavigation";

type Props = {
  open: boolean;
  onClose: () => void;
};

// id があるものは設定画面でキーを変えられる（FN0701-BR16）
type Row = { keys: string[]; description: string; id?: CustomShortcutId };

function row(id: CustomShortcutId, shortcut: Shortcut, description = shortcut.description): Row {
  return { keys: shortcutKeys(shortcut), description, id };
}

// 画面移動の Alt+数字は Docs を使う設定かで変わる。キーは変えたものを出す
const baseGroups = (navigation: NavigationItem[]): { title: string; rows: Row[] }[] => [
  {
    title: "共通",
    rows: [
      ...navigation.map(({ page, shortcut }) => row(`NAV_${page}`, shortcut)),
      row("PLACE_SWITCH", SHORTCUT.PLACE_SWITCH),
      row("NEW_WINDOW", SHORTCUT.NEW_WINDOW),
      row("QUICK_OPEN", SHORTCUT.QUICK_OPEN),
      { keys: ["?"], description: SHORTCUT.HELP.description },
      ...(isTauri()
        ? [
            { keys: ["Ctrl", "+"], description: "拡大（デスクトップアプリ）" },
            { keys: ["Ctrl", "-"], description: "縮小（デスクトップアプリ）" },
            { keys: ["Ctrl", "0"], description: "拡大・縮小を 100% に戻す（デスクトップアプリ）" },
            { keys: ["Ctrl", "ホイール"], description: "拡大・縮小（デスクトップアプリ）" },
          ]
        : []),
    ],
  },
  {
    title: "Note・Wiki",
    rows: [
      row("CREATE", SHORTCUT.CREATE, "新規作成（Folder では新しいフォルダ）"),
      row("SAVE", SHORTCUT.SAVE),
      row("RENAME", SHORTCUT.RENAME, "タイトルを編集"),
      row("DELETE", SHORTCUT.DELETE, "削除（入力中以外）"),
      { keys: ["J / K"], description: "一覧で上下に移動（一覧にフォーカス中）" },
      { keys: ["Enter"], description: "一覧で選んだものを開く" },
      row("FOCUS_LEFT", SHORTCUT.FOCUS_LEFT),
      row("FOCUS_DOWN", SHORTCUT.FOCUS_DOWN),
      row("FOCUS_UP", SHORTCUT.FOCUS_UP),
      row("FOCUS_RIGHT", SHORTCUT.FOCUS_RIGHT),
      row("MD_BOLD", SHORTCUT.MD_BOLD),
      row("MD_ITALIC", SHORTCUT.MD_ITALIC),
      row("MD_STRIKE", SHORTCUT.MD_STRIKE),
      row("MD_CODE", SHORTCUT.MD_CODE),
      row("MD_LINK", SHORTCUT.MD_LINK),
      row("MD_FORMAT_TABLE", SHORTCUT.MD_FORMAT_TABLE),
    ],
  },
  {
    title: "Folder",
    rows: [
      row("FOLDER_OPEN", SHORTCUT.FOLDER_OPEN),
      row("FOLDER_PREVIEW", SHORTCUT.FOLDER_PREVIEW, "プレビュー（ファイル）"),
      row("FOLDER_PREVIEW_PANE", SHORTCUT.FOLDER_PREVIEW_PANE),
      { keys: ["↑ / ↓"], description: "選ぶ（Shift で範囲を広げる）" },
      row("FOLDER_SELECT_ALL", SHORTCUT.FOLDER_SELECT_ALL),
      row("FOLDER_COPY", SHORTCUT.FOLDER_COPY),
      row("FOLDER_COPY_LINK", SHORTCUT.FOLDER_COPY_LINK, "リンクをコピー"),
      row("FOLDER_CUT", SHORTCUT.FOLDER_CUT),
      row("FOLDER_PASTE", SHORTCUT.FOLDER_PASTE),
      row("FOLDER_RENAME", SHORTCUT.FOLDER_RENAME),
      row("FOLDER_DELETE", SHORTCUT.FOLDER_DELETE),
      row("FOLDER_FILTER", SHORTCUT.FOLDER_FILTER, "このフォルダ内を絞り込む"),
      row("FOLDER_ADDRESS", SHORTCUT.FOLDER_ADDRESS, "場所（パス・ari:// のリンク）を入力して移る"),
      row("FOLDER_PARENT", SHORTCUT.FOLDER_PARENT, "一つ上のフォルダへ（Alt+↑ も可）"),
      row("FOLDER_CLEAR", SHORTCUT.FOLDER_CLEAR),
    ],
  },
  ...(navigation.some((item) => item.page === "docs")
    ? [{ title: "Docs", rows: [{ keys: ["/"], description: "ファイル名・ID で検索" }] }]
    : []),
];

// Vim モードのキー（設定で変えたものを出す。FN0702）
function vimGroups(vim: VimSettings): { title: string; rows: Row[] }[] {
  const rows = VIM_ACTIONS.flatMap((action) => {
    const sequences = parseBinding(vim.keys[action.id]).sequences;
    if (sequences.length === 0) {
      return [];
    }
    const keys = sequences.map((tokens) =>
      tokens.map(displayToken).join(tokens.some((token) => token.length > 1) ? " " : ""),
    );
    const description = action.group === "Folder の操作" ? `Folder の一覧で${action.label}` : action.label;
    return [{ keys: [keys.join(" / ")], description }];
  });
  const editor: Row[] = vim.editor
    ? [
        { keys: [":w"], description: "本文を保存（Vim のエディタ）" },
        { keys: [":q"], description: "本文から一覧へ" },
        { keys: [":wq"], description: "保存して一覧へ（:x も同じ）" },
        { keys: [":e 名前"], description: "名前を入れて探して開く（Vim のエディタ）" },
      ]
    : [];
  return [{ title: "Vim モード（入力欄の外）", rows: [...rows, ...editor] }];
}

// ショートカットの一覧（? のダイアログと設定画面で使う）。query で説明・キーを絞り込む。
// editable なら（設定画面）、キーを押して変えられる（FN0701-BR16）
export function ShortcutList({ query = "", editable = false }: { query?: string; editable?: boolean }) {
  const vim = useVimSettings();
  const navigation = useNavigation();
  useShortcutVersion();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = [...(vim.enabled ? vimGroups(vim) : []), ...baseGroups(navigation)].map((group) => ({
    ...group,
    rows: group.rows.filter((row) => {
      const text = `${group.title} ${row.description} ${row.keys.join(" ")}`.toLowerCase();
      return words.every((word) => text.includes(word));
    }),
  })).filter((group) => group.rows.length > 0);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">一致するショートカットはありません</p>;
  }
  return (
    <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
              {group.title}
            </h3>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {group.rows.map((row) => (
                <div
                  key={row.description}
                  className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                >
                  <dt>{row.description}</dt>
                  <dd className="flex shrink-0 items-center gap-1">
                    {editable && row.id ? <KeyEditor id={row.id} keys={row.keys} /> : <Keys keys={row.keys} />}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
    </div>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return keys.map((key, index) => (
    <Fragment key={key}>
      {index > 0 && <span className="text-xs text-muted-foreground">+</span>}
      <Kbd>{key}</Kbd>
    </Fragment>
  ));
}

// キーを押して決める。Esc・ほかを押すと取り消し。同じ画面のほかの操作と同じキーは使わせない
function KeyEditor({ id, keys }: { id: CustomShortcutId; keys: string[] }) {
  const { user, showMessage } = useApp();
  const [capturing, setCapturing] = useState(false);
  const changed = !!getShortcutOverrides()[id];
  const docsEnabled = !!user?.docsEnabled;

  const stop = () => {
    setCapturing(false);
    setShortcutCapturing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      stop();
      return;
    }
    const combo = comboFromEvent(event);
    if (!combo) {
      return;
    }
    // 文字のキーだけだと、入力欄で打った文字でも動いてしまうため、Ctrl か Alt と組み合わせる
    if (combo.key.length === 1 && combo.key !== " " && !combo.ctrl && !combo.alt) {
      showMessage("error", "文字のキーは Ctrl か Alt と組み合わせてください");
      return;
    }
    const conflict = conflictOf(id, combo, docsEnabled);
    if (conflict) {
      showMessage("error", `「${conflict.description}」と同じキーです。ほかのキーを押してください`);
      return;
    }
    setShortcutKey(id, combo);
    stop();
  };

  return (
    <span className="flex items-center gap-1">
      {capturing ? (
        <input
          autoFocus
          readOnly
          value="キーを押してください（Esc で取り消し）"
          onKeyDown={handleKeyDown}
          onBlur={stop}
          aria-label="新しいキー"
          className="w-64 rounded border border-brand bg-background px-2 py-0.5 text-center text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setShortcutCapturing(true);
            setCapturing(true);
          }}
          title="押して、新しいキーを押す"
          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
        >
          <Keys keys={keys} />
          {changed && <span className="ml-1 text-[0.6875rem] text-brand">変更</span>}
        </button>
      )}
      {changed && !capturing && (
        <IconButton label="元のキーに戻す" onClick={() => setShortcutKey(id, null)} className="size-6">
          <RotateCcw size={13} />
        </IconButton>
      )}
    </span>
  );
}

// ショートカットの一覧（? で開く）
export default function ShortcutHelp({ open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      title="キーボードショートカット"
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        <ShortcutList />
      </div>
    </Dialog>
  );
}
