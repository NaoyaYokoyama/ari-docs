import MDEditor from "@uiw/react-md-editor";
import { CircleCheck, History, Link2, Plus, Save, Star, Trash2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import { HttpError } from "@/api/client";
import { moveToContentFolder } from "@/api/contentFolder";
import { uploadContentImage } from "@/api/contentImage";
import { deleteFavorite } from "@/api/favorite";
import { getNote } from "@/api/note";
import { getWiki } from "@/api/wiki";
import { useApp } from "@/app/AppContext";
import { type EditorMode, getEditorMode, setEditorMode } from "@/app/preferences";
import { useTheme } from "@/app/theme";
import { useCopyAriLink } from "@/app/useAriLink";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import Hint from "@/components/common/Hint";
import IconButton from "@/components/common/IconButton";
import Kbd from "@/components/common/Kbd";
import Spinner from "@/components/common/Spinner";
import { type AriLink, ariLinkLabel, parseAriLink, toAriLink } from "@/lib/ariLink";
import { formatSize } from "@/lib/fileType";
import { errorMessage, formatDateTime } from "@/lib/format";
import { compressImage } from "@/lib/imageCompress";
import type { ContentDetail, ContentItem, ContentKind } from "@/pages/content/contentKinds";
import ContentMarkdown, { contentMarkdownOptions } from "@/pages/content/ContentMarkdown";
import ContentSidebar, { type MoveTarget } from "@/pages/content/ContentSidebar";
import { folderPath } from "@/pages/content/contentTree";
import CreateContentDialog from "@/pages/content/CreateContentDialog";
import FolderNameDialog from "@/pages/content/FolderNameDialog";
import HistoryDialog from "@/pages/content/HistoryDialog";
import { insertImages, type MarkdownCommandId, runMarkdownCommand } from "@/pages/content/markdown/commands";
import { type MarkdownEditorHandle, textareaHandle } from "@/pages/content/markdown/editorHandle";
import MarkdownToolbar from "@/pages/content/MarkdownToolbar";
import MoveDialog from "@/pages/content/MoveDialog";
import { useContentFolders } from "@/pages/content/useContentFolders";
import { rememberOpened, syncRecent } from "@/quickOpen/recent";
import { isShortcut, SHORTCUT, type Shortcut, shortcutLabel } from "@/shortcut/shortcut";
import { useFocusNavigation } from "@/shortcut/useFocusNavigation";
import { usePageShortcuts } from "@/shortcut/usePageShortcuts";
import type { ContentFolder } from "@/types/contentFolder";
import { useVimHandlers } from "@/vim/vimHandlers";
import { useVimSettings } from "@/vim/vimSettings";

// Vim のエディタ（CodeMirror）は Vim モードのときだけ読み込む（使わない人の起動を重くしないため）
const VimEditor = lazy(() => import("@/vim/VimEditor"));

type Mode = EditorMode;

// hint: 一言の説明（設定の「ボタンの説明を出す」）
const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "edit", label: "編集", hint: "本文を広く使って書きます（仕上がりは出しません）" },
  { value: "live", label: "分割", hint: "左で書き、右で仕上がりを見ながら書きます" },
  { value: "preview", label: "プレビュー", hint: "仕上がりだけを読みやすく出します。書き換えはできません（i・F2 で書き始める）" },
];

// 本文の書式のキー（FN0404-BR04）
const FORMAT_SHORTCUTS: [Shortcut, MarkdownCommandId][] = [
  [SHORTCUT.MD_BOLD, "bold"],
  [SHORTCUT.MD_ITALIC, "italic"],
  [SHORTCUT.MD_STRIKE, "strike"],
  [SHORTCUT.MD_CODE, "code"],
  [SHORTCUT.MD_LINK, "link"],
  [SHORTCUT.MD_FORMAT_TABLE, "formatTable"],
];

// 画像のファイルだけ（SVG は受け取らない）
const isImageFile = (file: File) => /^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type);

type Props = {
  kind: ContentKind;
};

// Note・Wiki の画面（一覧 + Markdown エディタ）
export default function ContentPage({ kind }: Props) {
  const location = useLocation();
  const { user, showMessage, showConfirm, isDirty, setIsDirty } = useApp();
  // 変更履歴を開いている（FN0402）
  const [historyOpen, setHistoryOpen] = useState(false);
  const { resolved: colorMode } = useTheme();
  // Vim モードで「本文も Vim で編集する」なら、本文を Vim のエディタにする（FN0702-BR07）
  const vimSettings = useVimSettings();
  const vimEditor = vimSettings.enabled && vimSettings.editor;
  // プレビューで i を押したとき、分割に切り替えてから挿入モードにする
  const [insertOnOpen, setInsertOnOpen] = useState(false);

  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [selected, setSelected] = useState<ContentDetail | null>(null);
  const [loadingId, setLoadingId] = useState("");
  const [mode, setMode] = useState<Mode>(getEditorMode);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // フォルダ（FN0403）。新しく作る場所は、クリックしたフォルダか開いているものの入っているフォルダ
  const folders = useContentFolders(kind);
  const [currentFolderId, setCurrentFolderId] = useState("");
  const [createFolderId, setCreateFolderId] = useState("");
  const [folderDialog, setFolderDialog] = useState<
    { mode: "create"; parentId: string } | { mode: "rename"; folder: ContentFolder } | null
  >(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);

  const sidebarRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  // Vim のエディタの書き換えの窓口（VimEditor が作る）
  const vimHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const copyAriLink = useCopyAriLink();

  // 本文へ。プレビューには入力欄が無いので、表示の枠にフォーカスする（Vim モードの j・k でスクロールできるように）。
  // 表示を切り替えた直後にも呼ぶので、そのとき見えている入力欄で決める
  const focusEditor = () => {
    const input = [...(editorRef.current?.querySelectorAll<HTMLElement>("textarea, .cm-content") ?? [])].find(
      (element) => element.getClientRects().length > 0 && element.getBoundingClientRect().width > 0,
    );
    (input ?? editorRef.current)?.focus();
  };

  useFocusNavigation({
    left: () => sidebarRef.current?.focus(),
    right: () => titleRef.current?.focus(),
    up: () => titleRef.current?.focus(),
    down: focusEditor,
  });

  const loadItems = useCallback(async () => {
    try {
      setItems(await kind.list());
    } catch (error) {
      console.error(`${kind.label}一覧の取得に失敗しました`, error);
      setItems([]);
      showMessage("error", `${kind.label}一覧の取得に失敗しました`);
    }
  }, [kind, showMessage]);

  const changeMode = (next: Mode) => {
    setMode(next);
    setEditorMode(next);
  };

  // 選択（未保存の変更があれば確認する）
  const select = async (id: string) => {
    if (selected?.id === id) {
      setCurrentFolderId(folders.tree.folderOf.get(id) ?? "");
      return;
    }
    if (isDirty) {
      const confirmed = await showConfirm("未保存の変更があります。破棄して移動しますか？");
      if (!confirmed) {
        return;
      }
    }
    setCurrentFolderId(folders.tree.folderOf.get(id) ?? "");
    // 読み込み中は前のものを隠す（読み込み中に打った文字が黙って消えないように）
    setSelected(null);
    setIsDirty(false);
    setLoadingId(id);
    try {
      setSelected(await kind.get(id));
      setIsDirty(false);
    } catch (error) {
      console.error(`${kind.label}の取得に失敗しました`, error);
      showMessage("error", `${kind.label}の取得に失敗しました`);
    } finally {
      setLoadingId("");
    }
  };

  // 初期表示と、ホーム・お気に入りから開いたとき
  useEffect(() => {
    void loadItems();
    void folders.reload();
    const id = location.state?.[kind.stateKey];
    if (id) {
      void select(id);
    }
    // 探して開くの「新しい Note を作る」など（FN0003）。作る画面の入力欄にフォーカスを残す
    if (location.state?.create === true) {
      void openCreate();
    } else {
      requestAnimationFrame(() => sidebarRef.current?.focus());
    }
    // location.key が変わったとき（別の画面から開き直したとき）だけ動かす
  }, [location.key]);

  // 探して開く（FN0003）の「最近開いたもの」に残す。場所は入っているフォルダの名前を "/" でつないだもの
  const placeOf = (id: string) => folderPath(folders.tree, folders.tree.folderOf.get(id) ?? "", "/");
  useEffect(() => {
    if (selected) {
      rememberOpened(user?.userId, {
        kind: kind.kind,
        id: selected.id,
        name: selected.title,
        location: placeOf(selected.id),
        path: "",
      });
    }
  }, [selected?.id]);

  // 一覧とフォルダを読んだら、最近開いたものから消えたものを除き、名前・場所を今のものにする
  useEffect(() => {
    if (items && folders.data) {
      syncRecent(
        user?.userId,
        kind.kind,
        new Map(items.map((item) => [item.id, { name: item.title, location: placeOf(item.id) }])),
      );
    }
  }, [items, folders.tree]);

  // 画面を離れるときは未保存の印を消す（ヘッダーで確認済み）
  useEffect(() => () => setIsDirty(false), [setIsDirty]);

  // アプリ（ウィンドウ）を閉じるときも未保存なら確認する
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const edit = (changes: Partial<ContentDetail>) => {
    if (!selected) {
      return;
    }
    setSelected({ ...selected, ...changes });
    setIsDirty(true);
  };

  const create = async (title: string) => {
    try {
      const created = await kind.create(title);
      // フォルダの中に作るときは、作ってから入れる
      if (createFolderId) {
        try {
          await moveToContentFolder(kind.kind, [], [created.id], createFolderId);
        } catch (error) {
          showMessage("error", errorMessage(error, "フォルダに入れられませんでした（一番上に作りました）"));
        }
        await folders.reload();
      }
      setCurrentFolderId(createFolderId);
      setCreateOpen(false);
      setSelected(created);
      setIsDirty(false);
      showMessage("info", `${kind.label}を作成しました`);
      await loadItems();
      // 作ったらすぐ書けるようにする
      if (mode === "preview") {
        setMode("live");
      }
      requestAnimationFrame(focusEditor);
      return null;
    } catch (error) {
      return errorMessage(error, `${kind.label}の登録に失敗しました`);
    }
  };

  const openCreate = async (folderId = currentFolderId) => {
    if (isDirty) {
      const confirmed = await showConfirm("未保存の変更があります。破棄して移動しますか？");
      if (!confirmed) {
        return;
      }
      setIsDirty(false);
    }
    setCreateFolderId(folders.tree.folders.has(folderId) ? folderId : "");
    setCreateOpen(true);
  };

  // 保存。開いたあとにほかの人（ほかの PC）が更新していたら、上書きするか確かめる（FN0501-BR10）
  const save = async (force = false) => {
    if (!selected || (saving && !force)) {
      return;
    }
    if (!selected.title.trim()) {
      showMessage("error", "タイトルを入力してください");
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    let retry = false;
    try {
      const response = await kind.update(
        selected.id,
        selected.title,
        selected.content,
        selected.updatedAt,
        force,
      );
      setIsDirty(false);
      showMessage("info", `${kind.label}を更新しました`);
      setSelected((current) =>
        current?.id === selected.id
          ? {
              ...current,
              updatedAt: response.data.updatedAt,
              updatedBy: current.updatedBy !== undefined ? user?.displayName : undefined,
            }
          : current,
      );
      await loadItems();
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        retry = await showConfirm(error.message);
        if (!retry) {
          showMessage("info", "保存をやめました。変更は残っています（変更履歴で相手の内容も見られます）");
        }
      } else {
        console.error(error);
        showMessage("error", errorMessage(error, `${kind.label}の更新に失敗しました`));
      }
    } finally {
      setSaving(false);
    }
    if (retry) {
      await save(true);
    }
  };


  // 書式のボタン・キー・画像で書き換える本文のエディタ（FN0404）
  const editorHandle = (): MarkdownEditorHandle | null => {
    if (vimEditor) {
      return vimHandleRef.current;
    }
    const textarea = editorRef.current?.querySelector("textarea");
    return textarea ? textareaHandle(textarea) : null;
  };

  const runCommand = (id: MarkdownCommandId) => {
    const handle = mode === "preview" ? null : editorHandle();
    if (!handle) {
      return;
    }
    const change = runMarkdownCommand(id, handle.read());
    if (!change) {
      showMessage("info", "表を整えるには、カーソルを表の中に置いてください");
      return;
    }
    handle.apply(change);
  };

  // 画像を縮小して保存し、カーソルの所に ![説明](URL) を入れる（FN0404-BR02）
  const addImages = async (files: File[], alt?: string) => {
    const images = files.filter(isImageFile);
    if (images.length === 0 || !selected || mode === "preview") {
      if (files.length > 0 && images.length === 0) {
        showMessage("error", "貼り付けられる画像は PNG・JPEG・GIF・WebP・BMP です");
      }
      return;
    }
    showMessage("info", "画像を縮小して保存しています…");
    try {
      let before = 0;
      let after = 0;
      const uploaded = [];
      for (const file of images) {
        const compressed = await compressImage(file);
        const response = await uploadContentImage(kind.kind, compressed);
        before += file.size;
        after += compressed.size;
        uploaded.push({ alt: alt ?? file.name.replace(/\.[^.]+$/, ""), url: response.url });
      }
      const handle = editorHandle();
      if (!handle) {
        return;
      }
      handle.apply(insertImages(handle.read(), uploaded));
      showMessage("info", `画像を貼り付けました（${formatSize(before)} → ${formatSize(after)}）`);
    } catch (error) {
      console.error(error);
      showMessage("error", errorMessage(error, "画像を貼り付けられませんでした"));
    }
  };

  // ari-docs の中のリンク（ari://…。FN0004）を貼ったら、名前を付けた Markdown のリンク（[名前](リンク)）にする。
  // Wiki・Note は今のタイトルを引く（引けなければ「Wiki」「Note」）
  const pasteAriLinks = async (links: AriLink[]) => {
    const labelOf = async (link: AriLink) => {
      try {
        if (link.kind === "wiki") {
          return (await getWiki(link.id)).title;
        }
        if (link.kind === "note") {
          return (await getNote(link.id)).title;
        }
      } catch {
        // 消えた・見られないものは種類の名前にする
      }
      return ariLinkLabel(link);
    };
    const labels = await Promise.all(links.map(labelOf));
    const handle = editorHandle();
    if (!handle) {
      return;
    }
    const text = links.map((link, index) => `[${labels[index].replace(/[[\]]/g, "")}](${toAriLink(link)})`).join("\n");
    const { from, to } = handle.read();
    handle.apply({ from, to, insert: text, selectFrom: from + text.length, selectTo: from + text.length });
  };

  const remove = async () => {
    if (!selected) {
      return;
    }
    const confirmed = await showConfirm(`${kind.label}「${selected.title}」を削除しますか？`);
    if (!confirmed) {
      return;
    }
    try {
      await kind.remove(selected.id);
      setSelected(null);
      setIsDirty(false);
      showMessage("info", `${kind.label}を削除しました`);
      await Promise.all([loadItems(), folders.reload()]);
      sidebarRef.current?.focus();
    } catch (error) {
      console.error(error);
      showMessage("error", `${kind.label}の削除に失敗しました`);
    }
  };

  const toggleFavorite = async () => {
    if (!selected) {
      return;
    }
    try {
      if (selected.favoriteId) {
        await deleteFavorite(selected.favoriteId);
        setSelected({ ...selected, favoriteId: "" });
        showMessage("info", `${kind.label}をお気に入り解除しました`);
      } else {
        const response = await kind.addFavorite(selected.id);
        setSelected({ ...selected, favoriteId: response.data.favoriteId });
        showMessage("info", `${kind.label}をお気に入り登録しました`);
      }
    } catch (error) {
      console.error(error);
      showMessage(
        "error",
        selected.favoriteId
          ? `${kind.label}のお気に入り解除に失敗しました`
          : `${kind.label}のお気に入り登録に失敗しました`,
      );
    }
  };

  // Vim モードの i（FN0702）: プレビューでは書けないので分割に切り替えて書き始める。それ以外は本文へ（VimLayer の既定）
  useVimHandlers({
    // 領域の移動（<C-h> など）: 左は一覧、右・下は本文、上はタイトル（Alt+H/J/K/L と同じ並び。右だけ本文にする）
    paneLeft: () => sidebarRef.current?.focus(),
    paneRight: () => (selected ? focusEditor() : false),
    paneDown: () => (selected ? focusEditor() : false),
    paneUp: () => (selected ? titleRef.current?.focus() : false),
    insert: () => {
      if (!selected || mode !== "preview") {
        return false;
      }
      changeMode("live");
      if (vimEditor) {
        setInsertOnOpen(true);
      } else {
        requestAnimationFrame(() => requestAnimationFrame(focusEditor));
      }
    },
  });

  usePageShortcuts([
    { shortcut: SHORTCUT.SAVE, handler: () => void save(), whileTyping: true, enabled: !createOpen && !historyOpen },
    { shortcut: SHORTCUT.CREATE, handler: () => void openCreate(), whileTyping: true, enabled: !createOpen },
    {
      shortcut: SHORTCUT.RENAME,
      handler: () => {
        // プレビューではタイトルも書けないので、分割に切り替えてから選ぶ（Vim モードの i と同じ）
        if (mode === "preview") {
          changeMode("live");
          requestAnimationFrame(() => {
            titleRef.current?.focus();
            titleRef.current?.select();
          });
          return;
        }
        titleRef.current?.focus();
        titleRef.current?.select();
      },
      whileTyping: true,
      enabled: !!selected && !createOpen,
    },
    { shortcut: SHORTCUT.DELETE, handler: remove, enabled: !!selected && !createOpen },
  ]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <ContentSidebar
        ref={sidebarRef}
        kind={kind}
        items={items}
        folders={folders}
        selectedId={selected?.id ?? loadingId}
        currentFolderId={currentFolderId}
        onCurrentFolderChange={setCurrentFolderId}
        onSelect={(id) => void select(id)}
        onCreate={(folderId) => void openCreate(folderId)}
        onCreateFolder={(parentId) => setFolderDialog({ mode: "create", parentId })}
        onRenameFolder={(folder) => setFolderDialog({ mode: "rename", folder })}
        onMoveRequest={setMoveTarget}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 pt-3 pb-2">
              <div className="min-w-0 flex-1">
                <input
                  ref={titleRef}
                  value={selected.title}
                  // プレビューは読むだけ（本文と同じくタイトルも書けない）。フォーカスは移せるようにする（Alt+K など）
                  readOnly={mode === "preview"}
                  maxLength={kind.titleMaxLength}
                  onChange={(e) => edit({ title: e.target.value })}
                  onKeyDown={(e) => {
                    // タイトルで Enter を押したら本文へ
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      focusEditor();
                    }
                  }}
                  placeholder="タイトル"
                  aria-label="タイトル"
                  className={twMerge(
                    "w-full truncate rounded-md bg-transparent px-1 py-1 text-xl font-semibold outline-none placeholder:text-muted-foreground",
                    mode !== "preview" && "hover:bg-accent/50 focus:bg-accent/50",
                  )}
                />
                <div className="mt-0.5 flex items-center gap-3 px-1 text-xs text-muted-foreground">
                  {isDirty ? (
                    <span className="flex items-center gap-1 text-warning">
                      <span className="size-1.5 rounded-full bg-warning" />
                      未保存
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <CircleCheck size={13} />
                      保存済
                    </span>
                  )}
                  <span>
                    更新: {formatDateTime(selected.updatedAt)}
                    {selected.updatedBy && `（${selected.updatedBy}）`}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1 pt-1">
                <div role="group" aria-label="表示" className="mr-2 flex rounded-lg bg-muted p-0.5">
                  {MODES.map((item) => (
                    <Hint key={item.value} title={item.label} text={item.hint}>
                      <button
                        type="button"
                        onClick={() => changeMode(item.value)}
                        aria-pressed={mode === item.value}
                        className={twMerge(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          mode === item.value
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {item.label}
                      </button>
                    </Hint>
                  ))}
                </div>

                <IconButton
                  label={selected.favoriteId ? "お気に入り解除" : "お気に入り登録"}
                  active={!!selected.favoriteId}
                  hint={selected.favoriteId ? "お気に入りから外します" : "お気に入りに入れると、ホームの一覧からすぐ開けます"}
                  onClick={toggleFavorite}
                >
                  <Star
                    size={17}
                    className={selected.favoriteId ? "fill-warning text-warning" : undefined}
                  />
                </IconButton>
                <IconButton
                  label={`保存（${shortcutLabel(SHORTCUT.SAVE)}）`}
                  hint="変更を保存します。保存するたびに版が変更履歴に残ります"
                  onClick={() => void save()}
                  disabled={saving}
                  className={isDirty ? "text-foreground" : undefined}
                >
                  <Save size={17} />
                </IconButton>
                <IconButton
                  label="リンクをコピー"
                  hint={`ほかの人が ari-docs の探して開く（Ctrl+P）に貼ると、この${kind.label}を開けます${
                    kind.kind === "note" ? "（Note は自分しか開けません）" : ""
                  }`}
                  onClick={() => void copyAriLink([{ kind: kind.kind, id: selected.id }], selected.title)}
                >
                  <Link2 size={17} />
                </IconButton>
                <IconButton
                  label="変更履歴"
                  hint="これまでに保存した版を見て、前の版に戻せます"
                  onClick={() => setHistoryOpen(true)}
                >
                  <History size={17} />
                </IconButton>
                <IconButton
                  label="削除"
                  hint={`この${kind.label}を削除します。ゴミ箱は無いので元に戻せません`}
                  onClick={remove}
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={17} />
                </IconButton>
              </div>
            </div>

            {mode !== "preview" && <MarkdownToolbar onCommand={runCommand} onImages={(files) => void addImages(files)} />}

            <div
              ref={editorRef}
              // プレビューのときにフォーカスを受け、j・k などのスクロール先にする
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-hidden outline-none"
              data-color-mode={colorMode}
              // Vim モードの i（書き始める）で本文に移る
              data-vim-insert
              // 書式のキー（Ctrl+B など）。本文のエディタより先に受ける
              onKeyDownCapture={(event) => {
                if (mode === "preview" || event.nativeEvent.isComposing || !editorHandle()?.acceptsShortcuts()) {
                  return;
                }
                const found = FORMAT_SHORTCUTS.find(([shortcut]) => isShortcut(event.nativeEvent, shortcut));
                if (found) {
                  event.preventDefault();
                  event.stopPropagation();
                  runCommand(found[1]);
                }
              }}
              // 画像の貼り付け。文字も一緒に入っているとき（Excel のセルの写しなど）は文字を貼る
              onPasteCapture={(event) => {
                // ari-docs の中のリンクだけを貼ったとき（1 行に 1 つ）
                const lines = event.clipboardData
                  .getData("text/plain")
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                const links = lines.map(parseAriLink);
                if (mode !== "preview" && lines.length > 0 && links.every((link) => link !== null)) {
                  event.preventDefault();
                  event.stopPropagation();
                  void pasteAriLinks(links as AriLink[]);
                  return;
                }
                const files = [...event.clipboardData.files].filter(isImageFile);
                if (mode === "preview" || files.length === 0 || event.clipboardData.getData("text/plain")) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                void addImages(files, "画像");
              }}
              onDragOverCapture={(event) => {
                if (mode !== "preview" && event.dataTransfer.types.includes("Files")) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDropCapture={(event) => {
                const files = [...event.dataTransfer.files];
                if (mode === "preview" || files.length === 0) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                void addImages(files);
              }}
            >
              {vimEditor && mode !== "preview" ? (
                <div className="flex h-full min-h-0">
                  <div className={twMerge("min-w-0 flex-1", mode === "live" && "border-r border-border")}>
                    <Suspense fallback={<Spinner className="h-full" />}>
                      <VimEditor
                        key={selected.id}
                        value={selected.content}
                        onChange={(value) => edit({ content: value })}
                        onSave={() => void save()}
                        onQuit={() => sidebarRef.current?.focus()}
                        colorMode={colorMode}
                        settings={vimSettings}
                        autoInsert={insertOnOpen}
                        onAutoInsert={() => setInsertOnOpen(false)}
                        onHandle={(handle) => {
                          vimHandleRef.current = handle;
                        }}
                      />
                    </Suspense>
                  </div>
                  {mode === "live" && (
                    <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
                      <ContentMarkdown source={selected.content} />
                    </div>
                  )}
                </div>
              ) : (
              <MDEditor
                height="100%"
                preview={mode}
                value={selected.content}
                visibleDragbar={false}
                previewOptions={contentMarkdownOptions}
                onChange={(value) => edit({ content: value ?? "" })}
                // 書式のボタンは MarkdownToolbar（Vim のエディタと同じもの）。MDEditor の Ctrl+B なども使わない
                hideToolbar
                commands={[]}
                extraCommands={[]}
              />
              )}
            </div>
          </>
        ) : loadingId ? (
          <Spinner className="flex-1" />
        ) : (
          <EmptyState
            icon={kind.icon}
            title={`${kind.label}を選択してください`}
            description={
              <>
                {kind.description}。左の一覧から選ぶか、新しく作成します（
                <Kbd>Ctrl</Kbd>+<Kbd>N</Kbd>）
              </>
            }
            action={
              <Button onClick={() => void openCreate()}>
                <Plus size={16} />
                新しい{kind.label}
              </Button>
            }
            className="flex-1"
          />
        )}
      </main>

      <HistoryDialog
        kind={kind.kind}
        contentId={historyOpen && selected ? selected.id : null}
        onClose={() => setHistoryOpen(false)}
        onLoad={(version) => {
          setHistoryOpen(false);
          edit({ title: version.title, content: version.content });
          showMessage("info", `${formatDateTime(version.savedAt)} の版を読み込みました。保存すると、この版に戻ります`);
        }}
      />

      <CreateContentDialog
        kind={kind}
        open={createOpen}
        place={createFolderId ? folderPath(folders.tree, createFolderId) : ""}
        onClose={() => setCreateOpen(false)}
        onCreate={create}
      />

      <FolderNameDialog
        open={
          folderDialog?.mode === "create"
            ? {
                title: "新しいフォルダ",
                description: folderDialog.parentId
                  ? `「${folderPath(folders.tree, folderDialog.parentId)}」の中に作ります`
                  : `${kind.label}を分けるフォルダを作ります`,
                initial: "",
                submitLabel: "作成",
              }
            : folderDialog?.mode === "rename"
              ? { title: "フォルダの名前の変更", initial: folderDialog.folder.name, submitLabel: "変更" }
              : null
        }
        onClose={() => setFolderDialog(null)}
        onSubmit={async (name) => {
          if (folderDialog?.mode === "create") {
            const result = await folders.create(folderDialog.parentId, name);
            if (!result.error) {
              setFolderDialog(null);
              setCurrentFolderId(result.folderId);
            }
            return result.error;
          }
          if (folderDialog?.mode === "rename") {
            const error = await folders.rename(folderDialog.folder, name);
            if (!error) {
              setFolderDialog(null);
            }
            return error;
          }
          return null;
        }}
      />

      <MoveDialog
        tree={folders.tree}
        target={moveTarget}
        onClose={() => setMoveTarget(null)}
        onMove={(destId) => {
          if (moveTarget) {
            void folders.move(moveTarget.folderIds, moveTarget.itemIds, destId);
          }
          setMoveTarget(null);
        }}
      />
    </div>
  );
}
