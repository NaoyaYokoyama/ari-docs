import { FolderUp, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useApp } from "@/app/AppContext";
import { usePreferences } from "@/app/preferences";
import { useCopyAriLink } from "@/app/useAriLink";
import Button from "@/components/common/Button";
import ContextMenu from "@/components/common/ContextMenu";
import EmptyState from "@/components/common/EmptyState";
import { useNodes } from "@/hooks/useNodes";
import { NODES_CHANGED_EVENT } from "@/lib/editSync";
import CreateNodeDialog from "@/pages/node/CreateNodeDialog";
import NodeDialog from "@/pages/node/NodeDialog";
import { backgroundMenu, nodeMenu } from "@/pages/node/nodeMenu";
import { baseName, joinPath, parentPath } from "@/pages/node/nodePath";
import NodeTable from "@/pages/node/NodeTable";
import NodeToolbar from "@/pages/node/NodeToolbar";
import PreviewDialog from "@/pages/node/PreviewDialog";
import PreviewPane from "@/pages/node/PreviewPane";
import SelectionBar from "@/pages/node/SelectionBar";
import Sidebar from "@/pages/node/Sidebar";
import TrashView from "@/pages/node/TrashView";
import UploadConflictDialog from "@/pages/node/UploadConflictDialog";
import { useNodeActions } from "@/pages/node/useNodeActions";
import { useNodeShortcuts } from "@/pages/node/useNodeShortcuts";
import { useNodeUpload } from "@/pages/node/useNodeUpload";
import { forgetOpened, rememberOpened } from "@/quickOpen/recent";
import { isTyping, SHORTCUT } from "@/shortcut/shortcut";
import { usePageShortcuts } from "@/shortcut/usePageShortcuts";
import type { Node as NodeItem } from "@/types/node";
import { NodeType } from "@/types/nodeType";
import { inSidebar } from "@/vim/panes";
import { useVimHandlers } from "@/vim/vimHandlers";

type Menu = { position: { x: number; y: number }; node: NodeItem | null };

// 探して開く（FN0003）から来たときの動き。open: フォルダは中を開き、ファイルはアプリで開く。select: 選ぶだけ（場所を示す）。
// 無ければ（お気に入り・検索から）フォルダは中を開き、ファイルは詳細を開く
type NodeAction = "open" | "select";

// フォルダ画面（SCR0301）。一覧・ツリー・ゴミ箱と、各ダイアログ・メニューをまとめる
function Node() {
  const location = useLocation();
  const { user, showMessage } = useApp();
  // お気に入り・検索から遷移してきた場合は対象ノードの親フォルダを開く
  const initialNodePath: string = location.state?.nodePath ?? "";
  const shared = user?.mode === "shared";

  const [createOpen, setCreateOpen] = useState(false);
  const [nodeOpen, setNodeOpen] = useState(false);
  const [path, setPath] = useState(parentPath(initialNodePath));
  const [defaultType, setDefaultType] = useState<NodeType>(NodeType.Folder);
  const [detailNode, setDetailNode] = useState<NodeItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialNodePath ? [initialNodePath] : []),
  );
  const [targetPath, setTargetPath] = useState(initialNodePath);
  const [targetAction, setTargetAction] = useState<NodeAction | undefined>(location.state?.nodeAction);
  // Vim モードの範囲選択（V。FN0702）
  const [visual, setVisual] = useState(false);
  const [renamingPath, setRenamingPath] = useState("");
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [uploadMenu, setUploadMenu] = useState<Menu["position"] | null>(null);
  // プレビューしているファイル（FN0301-BR30）
  const [previewNode, setPreviewNode] = useState<NodeItem | null>(null);
  // ゴミ箱を表示している（FN0302）
  const [trashOpen, setTrashOpen] = useState(false);
  // ツリーを読み込み直すための番号
  const [version, setVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const { currentPath, nodes, loading, error, reload } = useNodes(path);
  const { showHidden, folderPreviewPane } = usePreferences();
  // 一覧の右のプレビュー（FN0301-BR31）。開いたときは設定に従い、ボタン・Alt+P で出し入れする（その間だけ）
  const [previewOpen, setPreviewOpen] = useState(folderPreviewPane);

  // 絞り込み（空白で区切った語をすべて名前に含むもの。大文字・小文字は区別しない。FN0301-BR25）
  const visibleNodes = useMemo(() => {
    // 隠しファイル（「.」で始まる名前）を出さない設定（FN0701）
    const shown = showHidden ? nodes : nodes.filter((node) => !node.name.startsWith("."));
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return shown;
    }
    return shown.filter((node) => words.every((word) => node.name.toLowerCase().includes(word)));
  }, [nodes, filter, showHidden]);

  const selectedNodes = useMemo(
    () => nodes.filter((node) => selected.has(node.path)),
    [nodes, selected],
  );
  const single = selectedNodes.length === 1 ? selectedNodes[0] : null;

  const refresh = useCallback(async () => {
    await reload();
    setVersion((v) => v + 1);
  }, [reload]);

  const navigateTo = useCallback((next: string) => {
    setVisual(false);
    setTrashOpen(false);
    setPath(next);
    setSelected(new Set());
    setFilter("");
    setRenamingPath("");
  }, []);

  const actions = useNodeActions({ currentPath, shared, setSelected, refresh, navigateTo });

  // 開く。ファイルは探して開く（FN0003）の「最近開いたもの」に残す
  const openNode = (node: NodeItem) => {
    if (node.nodeType !== NodeType.Folder) {
      rememberOpened(user?.userId, {
        kind: "file",
        id: "",
        name: node.name,
        location: parentPath(node.path),
        path: node.path,
      });
    }
    void actions.open(node);
  };
  const { progress, conflict, upload } = useNodeUpload({ currentPath, nodes, refresh });

  const openDetails = useCallback((node: NodeItem) => {
    setSelected(new Set([node.path]));
    setDetailNode(node);
    setNodeOpen(true);
  }, []);

  // 同じ画面のまま、探して開く（FN0003）などからほかのものを開いたとき。最初に開いたときは上の初期値で済んでいる
  const firstKey = useRef(location.key);
  useEffect(() => {
    const nodePath = location.state?.nodePath;
    if (location.key === firstKey.current || typeof nodePath !== "string") {
      return;
    }
    // folder の先頭へのリンク（FN0004）
    if (!nodePath) {
      navigateTo("");
      return;
    }
    navigateTo(parentPath(nodePath));
    setSelected(new Set([nodePath]));
    setTargetPath(nodePath);
    setTargetAction(location.state?.nodeAction);
  }, [location.key]);

  // 親フォルダの読み込み後、フォルダなら中を開き、ファイルなら選んで詳細を開く（FN0201 の 5.2）。
  // 探して開くから来たときは targetAction に従う
  useEffect(() => {
    // 親フォルダを読み終わるまで待つ（前のフォルダの一覧で探さない）
    if (!targetPath || loading || currentPath !== parentPath(targetPath)) {
      return;
    }
    const target = nodes.find((node) => node.path === targetPath);
    setTargetPath("");
    if (!target) {
      if (targetAction) {
        showMessage("error", `「${baseName(targetPath)}」が見つかりません（移動・削除された可能性があります）`);
        forgetOpened(user?.userId, { kind: "file", id: "", path: targetPath });
        setSelected(new Set());
      }
      return;
    }
    if (targetAction === "select") {
      requestAnimationFrame(() =>
        document.querySelector(`[data-path="${CSS.escape(target.path)}"]`)?.scrollIntoView({ block: "center" }),
      );
    } else if (target.nodeType === NodeType.Folder) {
      navigateTo(target.path);
    } else if (targetAction === "open") {
      openNode(target);
    } else {
      openDetails(target);
    }
  }, [nodes, targetPath, loading, currentPath, navigateTo, openDetails]);

  // 共有サーバーで開いたファイルの変更を戻したら、一覧を読み込み直す
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener(NODES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(NODES_CHANGED_EVENT, handler);
  }, [refresh]);

  const openCreate = (type: NodeType) => {
    setDefaultType(type);
    setCreateOpen(true);
  };

  const startRename = (node: NodeItem | null) => {
    if (node) {
      setSelected(new Set([node.path]));
      setRenamingPath(node.path);
    }
  };

  const selectAll = () => setSelected(new Set(visibleNodes.map((node) => node.path)));

  const openMenu = useCallback((position: Menu["position"], node: NodeItem | null) => {
    setMenu({ position, node });
  }, []);

  // ari-docs の中のリンク（FN0004）。ほかの人が探して開く（Ctrl+P）に貼ると、ここへ移れる
  const copyAriLink = useCopyAriLink();
  const copyNodeLinks = (targets: NodeItem[]) =>
    void copyAriLink(
      targets.map((node) => ({ kind: node.nodeType === NodeType.Folder ? "folder" : "file", path: node.path })),
      targets[0]?.name ?? "",
    );
  const copyFolderLink = () =>
    void copyAriLink([{ kind: "folder", path: currentPath }], baseName(currentPath) || "folder");

  const menuContext = {
    currentPath,
    shared,
    clipboard: actions.clipboard,
    selectedNodes,
    open: openNode,
    preview: setPreviewNode,
    download: (node: NodeItem) => void actions.download(node),
    downloadAsZip: (targets: NodeItem[]) => void actions.downloadAsZip(targets),
    reveal: (node: NodeItem) => void actions.reveal(node),
    copyToClipboard: (mode: "copy" | "cut") => actions.copyToClipboard(mode, selectedNodes),
    paste: (dest: string) => void actions.paste(dest),
    startRename,
    toggleFavorite: (node: NodeItem) => void actions.toggleFavorite(node),
    openDetails,
    remove: (targets: NodeItem[]) => void actions.remove(targets),
    create: openCreate,
    uploadFiles: () => fileInputRef.current?.click(),
    uploadFolder: () => folderInputRef.current?.click(),
    selectAll,
    refresh: () => void refresh(),
    copyLink: (targets: NodeItem[]) => copyNodeLinks(targets),
    copyFolderLink: () => copyFolderLink(),
  };

  const busy =
    trashOpen ||
    createOpen ||
    nodeOpen ||
    conflict !== null ||
    menu !== null ||
    uploadMenu !== null ||
    previewNode !== null;
  const listKeys = !busy && renamingPath === "";

  useNodeShortcuts({
    currentPath,
    onNavigate: navigateTo,
  });

  // Vim モード（FN0702）: l で開く、h で上のフォルダへ（j・k は一覧が受け持つ）。
  // yy・x・p・D・cw・V はファイルの操作（ranger・vifm と同じ考え方）。左のツリーにいるときは使わない
  const inList = (run: () => void) => () => {
    if (inSidebar()) {
      return false;
    }
    run();
  };
  useVimHandlers(
    {
      right: inList(() => single && openNode(single)),
      left: inList(() => currentPath && navigateTo(parentPath(currentPath))),
      yank: inList(() => actions.copyToClipboard("copy", selectedNodes)),
      cut: inList(() => actions.copyToClipboard("cut", selectedNodes)),
      paste: inList(() => void actions.paste(currentPath)),
      trash: inList(() => void actions.remove(selectedNodes)),
      rename: inList(() => startRename(single)),
      visual: inList(() => setVisual((on) => !on)),
    },
    listKeys,
  );

  // 範囲選択の間は y・d・x・D をそのまま操作にする（Vim のビジュアルモードと同じ。yy などを待たない）。
  // Esc・V で範囲選択だけやめる（選んだものは残すので、続けて yy・メニューなどを使える）
  const visualState = useRef({ selectedNodes, actions });
  visualState.current = { selectedNodes, actions };
  useEffect(() => {
    if (!visual || !listKeys) {
      if (!listKeys) {
        setVisual(false);
      }
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || isTyping(event) || inSidebar()) {
        return;
      }
      const { selectedNodes: targets, actions: current } = visualState.current;
      const run: Record<string, () => void> = {
        y: () => current.copyToClipboard("copy", targets),
        d: () => current.copyToClipboard("cut", targets),
        x: () => current.copyToClipboard("cut", targets),
        D: () => void current.remove(targets),
        Escape: () => undefined,
        V: () => undefined,
        v: () => undefined,
      };
      const action = run[event.key];
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setVisual(false);
      action();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [visual, listKeys]);

  usePageShortcuts([
    {
      shortcut: SHORTCUT.CREATE,
      handler: () => openCreate(NodeType.Folder),
      whileTyping: true,
      enabled: !busy,
    },
    { shortcut: SHORTCUT.FOLDER_OPEN, handler: () => single && openNode(single), enabled: listKeys && !!single },
    {
      shortcut: SHORTCUT.FOLDER_PREVIEW,
      handler: () => single && single.nodeType !== NodeType.Folder && setPreviewNode(single),
      enabled: listKeys && !!single,
    },
    { shortcut: SHORTCUT.FOLDER_PREVIEW_PANE, handler: () => setPreviewOpen((open) => !open), enabled: !trashOpen },
    { shortcut: SHORTCUT.FOLDER_DELETE, handler: () => void actions.remove(selectedNodes), enabled: listKeys },
    { shortcut: SHORTCUT.FOLDER_RENAME, handler: () => startRename(single), enabled: listKeys },
    { shortcut: SHORTCUT.FOLDER_SELECT_ALL, handler: selectAll, enabled: listKeys },
    { shortcut: SHORTCUT.FOLDER_COPY, handler: () => actions.copyToClipboard("copy", selectedNodes), enabled: listKeys },
    {
      shortcut: SHORTCUT.FOLDER_COPY_LINK,
      handler: () => (selectedNodes.length > 0 ? copyNodeLinks(selectedNodes) : copyFolderLink()),
      enabled: listKeys,
    },
    { shortcut: SHORTCUT.FOLDER_CUT, handler: () => actions.copyToClipboard("cut", selectedNodes), enabled: listKeys },
    { shortcut: SHORTCUT.FOLDER_PASTE, handler: () => void actions.paste(currentPath), enabled: listKeys },
    {
      shortcut: SHORTCUT.FOLDER_FILTER,
      handler: () => filterRef.current?.focus(),
      whileTyping: true,
      enabled: !busy,
    },
    {
      shortcut: SHORTCUT.FOLDER_PARENT,
      handler: () => currentPath && navigateTo(parentPath(currentPath)),
      enabled: listKeys,
    },
    {
      shortcut: SHORTCUT.FOLDER_CLEAR,
      handler: () => {
        setSelected(new Set());
        actions.clearCut();
      },
      enabled: listKeys,
    },
  ]);

  const cutPaths = useMemo(
    () => new Set(actions.clipboard?.mode === "cut" ? actions.clipboard.paths : []),
    [actions.clipboard],
  );

  return (
    <div className="flex h-full">
      <Sidebar
        onNavigate={navigateTo}
        currentPath={currentPath}
        trashOpen={trashOpen}
        onOpenTrash={() => {
          setTrashOpen(true);
          setSelected(new Set());
        }}
        version={version}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {trashOpen ? (
          <TrashView
            onRestored={(paths) => {
              void refresh();
              // 1 件ならそのフォルダを開いて選ぶ
              if (paths.length === 1) {
                navigateTo(parentPath(paths[0]));
                setSelected(new Set(paths));
              }
            }}
          />
        ) : (
          <>
            <NodeToolbar
              currentPath={currentPath}
              selected={selected}
              loading={loading}
              filter={filter}
              onFilterChange={setFilter}
              filterRef={filterRef}
              fileInputRef={fileInputRef}
              folderInputRef={folderInputRef}
              progress={progress}
              onNavigate={navigateTo}
              onRefresh={() => void refresh()}
              onUploadMenu={setUploadMenu}
              onUpload={(files, destPath) => void upload(files, destPath)}
              onTransfer={(paths, destPath, copy) => void actions.transfer(paths, destPath, copy)}
              onCreate={openCreate}
              previewOpen={previewOpen}
              onTogglePreview={() => setPreviewOpen((open) => !open)}
            />

            {selected.size > 1 && (
              <SelectionBar
                count={selected.size}
                onCut={() => actions.copyToClipboard("cut", selectedNodes)}
                onCopy={() => actions.copyToClipboard("copy", selectedNodes)}
                onZip={() => void actions.downloadAsZip(selectedNodes)}
                onRemove={() => void actions.remove(selectedNodes)}
                onClear={() => setSelected(new Set())}
              />
            )}

            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                {error ? (
                  <EmptyState
                    icon={TriangleAlert}
                    title={error}
                    description="フォルダが移動・削除された可能性があります"
                    action={
                      <Button variant="secondary" onClick={() => navigateTo("")}>
                        folder の先頭へ
                      </Button>
                    }
                  />
                ) : (
                  <NodeTable
                    nodes={visibleNodes}
                    loading={loading}
                    selected={selected}
                    onSelectionChange={setSelected}
                    cutPaths={cutPaths}
                    renamingPath={renamingPath}
                    onRenameEnd={(node, newName) => {
                      setRenamingPath("");
                      void actions.rename(node, newName);
                    }}
                    onOpen={openNode}
                    onPreview={setPreviewNode}
                    onMenu={openMenu}
                    onDropFiles={(files, destPath) => void upload(files, destPath)}
                    onDropNodes={(paths, destPath, copy) => void actions.transfer(paths, destPath, copy)}
                    currentPath={currentPath}
                    keyboardEnabled={listKeys}
                    visual={visual}
                    emptyTitle={filter ? `「${filter}」に一致するものはありません` : "このフォルダは空です"}
                  />
                )}
              </div>
              {previewOpen && (
                <PreviewPane
                  selected={selectedNodes}
                  onOpen={openNode}
                  onDownload={(node) => void actions.download(node)}
                  onClose={() => setPreviewOpen(false)}
                />
              )}
            </div>
          </>
        )}

        {visual && (
          <div className="pointer-events-none fixed bottom-3 left-1/2 z-[1000] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 font-mono text-sm text-popover-foreground shadow-md">
            -- VISUAL LINE -- {selected.size} 件
          </div>
        )}

        <ContextMenu
          position={menu?.position ?? null}
          items={menu ? (menu.node ? nodeMenu(menuContext) : backgroundMenu(menuContext)) : []}
          onClose={() => setMenu(null)}
        />

        <ContextMenu
          position={uploadMenu}
          items={[
            { label: "ファイルをアップロード", icon: Upload, onSelect: () => fileInputRef.current?.click() },
            { label: "フォルダをアップロード", icon: FolderUp, onSelect: () => folderInputRef.current?.click() },
          ]}
          onClose={() => setUploadMenu(null)}
        />

        <PreviewDialog
          node={previewNode}
          onClose={() => setPreviewNode(null)}
          onOpen={openNode}
          onDownload={(node) => void actions.download(node)}
        />

        <UploadConflictDialog names={conflict?.names ?? null} onChoose={(choice) => conflict?.resolve(choice)} />

        <CreateNodeDialog
          open={createOpen}
          defaultType={defaultType}
          currentPath={currentPath}
          onClose={() => setCreateOpen(false)}
          onCreated={(name) => {
            setCreateOpen(false);
            setSelected(new Set([joinPath(currentPath, name)]));
            void refresh();
          }}
        />

        <NodeDialog
          nodeOpen={nodeOpen}
          node={detailNode}
          onClose={() => setNodeOpen(false)}
          onOpen={openNode}
          onChanged={() => void refresh()}
        />
      </main>
    </div>
  );
}

export default Node;
