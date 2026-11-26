import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, EllipsisVertical, Eye, FolderOpen, Lock, Star, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useApp } from "@/app/AppContext";
import EmptyState from "@/components/common/EmptyState";
import IconButton from "@/components/common/IconButton";
import Spinner from "@/components/common/Spinner";
import { fileKind, formatSize } from "@/lib/fileType";
import { timeOf } from "@/lib/format";
import { MAX_PREVIEW_BYTES } from "@/lib/previewFormats";
import { previewKind } from "@/pages/node/FilePreview";
import {
  canDropInto,
  draggedPaths,
  endNodeDrag,
  filesFromDrop,
  isDragFrom,
  isFileDrag,
  isFromOtherPlace,
  isNodeDrag,
  startNodeDrag,
  wantsCopy,
} from "@/pages/node/nodeDrag";
import { parentPath } from "@/pages/node/nodePath";
import RenameInput from "@/pages/node/RenameInput";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";
import type { UploadFile } from "@/types/uploadFile";
import { inSidebar } from "@/vim/panes";
import { useVimHandlers } from "@/vim/vimHandlers";

type Props = {
  nodes: Node[];
  loading: boolean;
  selected: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  // 切り取り中のもの（薄く表示する）
  cutPaths: Set<string>;
  // 名前を変えている行
  renamingPath: string;
  onRenameEnd: (node: Node, newName: string | null) => void;
  // フォルダは中を開き、ファイルは OS のアプリで開く
  onOpen: (node: Node) => void;
  // プレビュー（Space と同じ）
  onPreview: (node: Node) => void;
  // 行（node）か空いているところ（null）の右クリック・「︙」
  onMenu: (position: { x: number; y: number }, node: Node | null) => void;
  // OS のファイル・フォルダのドロップ。destPath は表示中のフォルダか、ドロップしたフォルダの行
  onDropFiles: (files: UploadFile[], destPath: string) => void;
  // 一覧の行のドロップ（移動。copy が true ならコピー）
  onDropNodes: (paths: string[], destPath: string, copy: boolean) => void;
  currentPath: string;
  // キー操作（↑↓）を受けるか（ダイアログ・メニューを開いている間は受けない）
  keyboardEnabled: boolean;
  // Vim モードの範囲選択（V）の間は、j・k などで選ぶ範囲を広げる
  visual: boolean;
  emptyTitle: string;
};

// 囲んで選ぶ（FN0301-BR35）を始められる列。名前と操作のボタンの列は、行のドラッグ（移動・コピー）に使う
const LASSO_COLUMNS = new Set(["description", "updatedBy", "updatedAt", "size"]);
// これより動かしたら囲み始める（クリックと見分ける）
const LASSO_THRESHOLD = 4;
// 一覧の上下の端からこの幅に入ったら、囲みながらスクロールする
const LASSO_EDGE = 32;

type Lasso = { x0: number; y0: number; x1: number; y1: number };

// 選ぶためのチェックボックス（FN0301-BR37）。見出しのものは、一部だけ選んでいるとき「－」
function SelectBox({
  checked,
  indeterminate = false,
  label,
  onToggle,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle: (event: React.MouseEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      // 選ぶのはクリックで行う（Shift の範囲選択のため。行のクリック・ダブルクリックには渡さない）
      onChange={() => {}}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(event);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className="size-4 cursor-pointer align-middle accent-brand"
    />
  );
}

// 一覧が狭いとき（右のプレビューを出したとき・ウィンドウが狭いとき）に出さない列。名前の幅を残すため。
// 説明はプレビュー・詳細でも見られる。幅は一覧（@container）の幅で決める
const NARROW_HIDDEN: Record<string, string> = {
  description: "hidden @4xl:table-cell",
  updatedBy: "hidden @2xl:table-cell",
};

function NodeTable({
  nodes,
  loading,
  selected,
  onSelectionChange,
  cutPaths,
  renamingPath,
  onRenameEnd,
  onOpen,
  onPreview,
  onMenu,
  onDropFiles,
  onDropNodes,
  currentPath,
  keyboardEnabled,
  visual,
  emptyTitle,
}: Props) {
  const { user, showMessage } = useApp();
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  // ドロップ先。表示中のフォルダ（背景）は currentPath、フォルダの行はそのパス。null はドラッグしていない
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // 背景へのドロップが、OS のファイル（アップロード）か、ほかのウィンドウの行（移動）か
  const [dropKind, setDropKind] = useState<"files" | "nodes">("files");
  // Shift で範囲を選ぶときの起点
  const anchor = useRef<string | null>(null);
  // 囲んで選ぶ（FN0301-BR35）。座標は一覧の中身の上の位置（スクロールしても変わらない）
  const listRef = useRef<HTMLDivElement>(null);
  const [lasso, setLasso] = useState<Lasso | null>(null);
  // 囲み終えたときのクリックで、選んだものを消さないように
  const suppressClick = useRef(false);

  const columns = useMemo<ColumnDef<Node>[]>(
    () => [
      // チェックボックスで選ぶ（FN0301-BR37）。キーを押さずに足す・外す。Shift で起点からの範囲を足す
      {
        id: "select",
        size: 36,
        enableSorting: false,
        header: () => {
          const count = nodes.filter((node) => selected.has(node.path)).length;
          const all = nodes.length > 0 && count === nodes.length;
          return (
            <SelectBox
              label={all ? "すべての選択を外す" : "すべて選ぶ"}
              checked={all}
              indeterminate={count > 0 && !all}
              onToggle={() => onSelectionChange(all ? new Set() : new Set(nodes.map((node) => node.path)))}
            />
          );
        },
        cell: ({ row }) => {
          const path = row.original.path;
          return (
            <SelectBox
              label={`「${row.original.name}」を選ぶ`}
              checked={selected.has(path)}
              onToggle={(event) => toggleRef.current(path, event.shiftKey)}
            />
          );
        },
      },
      // 操作のボタンは左端（名前のすぐ横で、幅が広くても目で追いやすい）
      {
        id: "actions",
        header: "",
        size: 40,
        enableSorting: false,
        cell: ({ row }) => (
          <IconButton
            label="操作"
            onClick={(e) => {
              e.stopPropagation();
              if (!selected.has(row.original.path)) {
                onSelectionChange(new Set([row.original.path]));
              }
              const rect = e.currentTarget.getBoundingClientRect();
              onMenu({ x: rect.left, y: rect.bottom + 2 }, row.original);
            }}
            className="opacity-60 group-hover:opacity-100"
          >
            <EllipsisVertical size={16} />
          </IconButton>
        ),
      },
      {
        accessorKey: "name",
        header: "名前",
        // フォルダを先に並べる
        sortingFn: (a, b) => {
          const folderFirst =
            Number(b.original.nodeType === NodeType.Folder) -
            Number(a.original.nodeType === NodeType.Folder);
          return folderFirst || a.original.name.localeCompare(b.original.name, "ja");
        },
        cell: ({ row }) => {
          const node = row.original;
          const folder = node.nodeType === NodeType.Folder;
          const { icon: Icon, className } = fileKind(node.name, folder);
          return (
            <span className="flex min-w-0 items-center gap-2.5">
              <Icon size={17} className={twMerge("shrink-0", className)} />
              {renamingPath === node.path ? (
                <RenameInput node={node} onEnd={(newName) => onRenameEnd(node, newName)} />
              ) : (
                <span className="truncate" title={node.name}>
                  {node.name}
                </span>
              )}
              {node.favoriteId && (
                <Star size={13} className="shrink-0 fill-warning text-warning" aria-label="お気に入り" />
              )}
              {/* ロック（FN0301-BR38）。自分のロックは差し色、ほかの人のロックは注意の色 */}
              {node.lock && (
                <span
                  title={`${node.lock.mine ? "自分" : `${node.lock.userName}さん`}がロック中（${node.lock.expiresAt} まで）`}
                  className={twMerge(
                    "flex shrink-0 items-center gap-0.5 text-xs",
                    node.lock.mine ? "text-brand" : "text-warning",
                  )}
                >
                  <Lock size={13} aria-label="ロック中" />
                  <span className="hidden max-w-24 truncate @xl:inline">
                    {node.lock.mine ? "自分" : node.lock.userName}
                  </span>
                </span>
              )}
              {/* プレビューできるファイルには目の印を出す（Space でプレビューできるものが一目で分かるように。FN0301-BR30） */}
              {!folder && previewKind(node.name) !== "none" && node.size <= MAX_PREVIEW_BYTES && (
                <IconButton
                  label="プレビュー（Space）"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectionChange(new Set([node.path]));
                    onPreview(node);
                  }}
                  className="-ml-1 size-6 shrink-0 text-muted-foreground/70 hover:text-foreground"
                >
                  <Eye size={15} />
                </IconButton>
              )}
            </span>
          );
        },
      },
      // 説明（FN0301-BR33）。詳細の画面で書く
      {
        accessorKey: "description",
        header: "説明",
        size: 180,
        cell: ({ getValue }) => (
          <span className="block truncate text-muted-foreground" title={getValue<string>()}>
            {getValue<string>()}
          </span>
        ),
      },
      ...(user?.mode !== "local"
        ? ([
            {
              accessorKey: "updatedBy",
              header: "更新者",
              size: 120,
              cell: ({ getValue }) => (
                <span className="block truncate" title={getValue<string>()}>
                  {getValue<string>()}
                </span>
              ),
            },
          ] as ColumnDef<Node>[])
        : []),
      {
        accessorKey: "updatedAt",
        header: "更新日時",
        size: 160,
        sortingFn: (a, b) => timeOf(a.original.updatedAt) - timeOf(b.original.updatedAt),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground tabular-nums">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "size",
        header: "サイズ",
        size: 96,
        // フォルダは先（サイズなし）
        sortingFn: (a, b) =>
          (a.original.nodeType === NodeType.Folder ? -1 : a.original.size) -
          (b.original.nodeType === NodeType.Folder ? -1 : b.original.size),
        cell: ({ row }) => (
          <span className="block text-right text-muted-foreground tabular-nums">
            {row.original.nodeType === NodeType.Folder ? "" : formatSize(row.original.size)}
          </span>
        ),
      },
    ],
    [user?.mode, nodes, renamingPath, onRenameEnd, onMenu, onPreview, selected, onSelectionChange],
  );

  const table = useReactTable({
    data: nodes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const orderedPaths = rows.map((row) => row.original.path);

  // クリック: そのものだけ、Ctrl（macOS は ⌘）: 足す・外す、Shift: 起点からの範囲
  const select = (node: Node, event: React.MouseEvent) => {
    if (event.shiftKey && anchor.current && orderedPaths.includes(anchor.current)) {
      const from = orderedPaths.indexOf(anchor.current);
      const to = orderedPaths.indexOf(node.path);
      const range = orderedPaths.slice(Math.min(from, to), Math.max(from, to) + 1);
      onSelectionChange(new Set(event.ctrlKey || event.metaKey ? [...selected, ...range] : range));
      return;
    }
    anchor.current = node.path;
    if (event.ctrlKey || event.metaKey) {
      const next = new Set(selected);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      onSelectionChange(next);
      return;
    }
    onSelectionChange(new Set([node.path]));
  };

  // チェックボックス（FN0301-BR37）: 1 つを足す・外す。Shift なら起点からの範囲を足す
  const toggleCheck = (path: string, range: boolean) => {
    if (range && anchor.current && orderedPaths.includes(anchor.current)) {
      const from = orderedPaths.indexOf(anchor.current);
      const to = orderedPaths.indexOf(path);
      onSelectionChange(new Set([...selected, ...orderedPaths.slice(Math.min(from, to), Math.max(from, to) + 1)]));
      return;
    }
    anchor.current = path;
    const next = new Set(selected);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    onSelectionChange(next);
  };
  const toggleRef = useRef(toggleCheck);
  toggleRef.current = toggleCheck;

  // ↑↓ で選ぶ（Shift で範囲を広げる）。Vim モードの j・k・gg・G なども同じ動き（FN0702）
  const keyState = useRef({ orderedPaths, selected, onSelectionChange });
  keyState.current = { orderedPaths, selected, onSelectionChange };
  // nextIndex: 今の位置（選んでいなければ -1）と行の数から、次の位置を決める
  const moveSelection = (nextIndex: (index: number, length: number) => number, extend = false) => {
    const { orderedPaths: paths, selected: current, onSelectionChange: change } = keyState.current;
    if (paths.length === 0) {
      return;
    }
    const focus = [...current].pop();
    const index = focus ? paths.indexOf(focus) : -1;
    const targetIndex = Math.max(0, Math.min(paths.length - 1, nextIndex(index, paths.length)));
    const next = paths[targetIndex];
    if (extend && anchor.current && paths.includes(anchor.current)) {
      const from = paths.indexOf(anchor.current);
      // 範囲の最後を next にする（Set の最後の要素を基準に動くよう、next を最後に入れる）
      const range = paths.slice(Math.min(from, targetIndex), Math.max(from, targetIndex) + 1);
      change(new Set([...range.filter((path) => path !== next), next]));
    } else {
      anchor.current = next;
      change(new Set([next]));
    }
    document.querySelector(`[data-path="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const moveRef = useRef(moveSelection);
  moveRef.current = moveSelection;

  // 選んでいなければ、下へは先頭・上へは末尾から
  const step = (delta: number) => (index: number, length: number) =>
    index === -1 ? (delta > 0 ? 0 : length - 1) : index + delta;

  useEffect(() => {
    if (!keyboardEnabled) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      if (event.altKey || event.ctrlKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) {
        return;
      }
      if (keyState.current.orderedPaths.length === 0) {
        return;
      }
      event.preventDefault();
      moveRef.current(step(event.key === "ArrowDown" ? 1 : -1), event.shiftKey);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyboardEnabled]);

  // 範囲選択を始めたら、今いる行（選んでいなければ先頭の行）を起点にする
  useEffect(() => {
    if (!visual) {
      return;
    }
    const { orderedPaths: paths, selected: current, onSelectionChange: change } = keyState.current;
    const focus = [...current].pop() ?? paths[0];
    if (focus) {
      anchor.current = focus;
      change(new Set([focus]));
    }
  }, [visual]);

  // 左のツリー（<C-h> で移ったとき）では使わず、ツリーの行の移動に回す
  const listMove = (nextIndex: Parameters<typeof moveSelection>[0]) => {
    if (inSidebar()) {
      return false;
    }
    moveSelection(nextIndex, visual);
  };
  useVimHandlers(
    {
      down: (count) => listMove(step(count)),
      up: (count) => listMove(step(-count)),
      halfDown: (count) => listMove(step(10 * count)),
      halfUp: (count) => listMove(step(-10 * count)),
      top: () => listMove(() => 0),
      bottom: () => listMove((_, length) => length - 1),
    },
    !!keyboardEnabled,
  );

  // 空いているところ・名前の外の列からドラッグすると、囲んだ行を選ぶ（エクスプローラーと同じ）。
  // Ctrl・Shift を押していれば、今選んでいるものに足す
  const startLasso = (event: React.MouseEvent<HTMLDivElement>) => {
    const list = listRef.current;
    const target = event.target as HTMLElement;
    if (event.button !== 0 || !list || renamingPath) {
      return;
    }
    const cell = target.closest<HTMLElement>("td[data-column]");
    const fromBackground = target === list || target.tagName === "TBODY" || target.tagName === "TABLE";
    if (!fromBackground && !(cell && LASSO_COLUMNS.has(cell.dataset.column ?? ""))) {
      return;
    }
    // 行のドラッグ（移動）と文字の選択を始めない
    event.preventDefault();
    const base = event.ctrlKey || event.metaKey || event.shiftKey ? new Set(selected) : new Set<string>();
    const point = (clientX: number, clientY: number) => {
      const rect = list.getBoundingClientRect();
      return { x: clientX - rect.left + list.scrollLeft, y: clientY - rect.top + list.scrollTop };
    };
    const start = point(event.clientX, event.clientY);
    let last = { clientX: event.clientX, clientY: event.clientY };
    let active = false;

    const update = () => {
      const end = point(last.clientX, last.clientY);
      if (!active) {
        if (Math.hypot(end.x - start.x, end.y - start.y) < LASSO_THRESHOLD) {
          return;
        }
        active = true;
      }
      setLasso({ x0: start.x, y0: start.y, x1: end.x, y1: end.y });
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      const listTop = list.getBoundingClientRect().top - list.scrollTop;
      const inside: string[] = [];
      list.querySelectorAll<HTMLElement>("tr[data-path]").forEach((row) => {
        const rowRect = row.getBoundingClientRect();
        const rowTop = rowRect.top - listTop;
        if (rowTop < bottom && rowTop + rowRect.height > top) {
          inside.push(row.dataset.path ?? "");
        }
      });
      onSelectionChange(new Set([...base, ...inside]));
      if (inside.length > 0) {
        anchor.current = inside[start.y <= end.y ? inside.length - 1 : 0];
      }
    };

    // 端に寄せている間は、動かさなくてもスクロールを続ける
    const timer = window.setInterval(() => {
      const rect = list.getBoundingClientRect();
      const delta =
        last.clientY < rect.top + LASSO_EDGE ? -16 : last.clientY > rect.bottom - LASSO_EDGE ? 16 : 0;
      if (active && delta !== 0) {
        list.scrollTop += delta;
        update();
      }
    }, 30);

    const handleMove = (moveEvent: MouseEvent) => {
      last = { clientX: moveEvent.clientX, clientY: moveEvent.clientY };
      update();
    };
    const handleUp = () => {
      window.clearInterval(timer);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (active) {
        suppressClick.current = true;
        // クリックが来なかったとき（一覧の外で離した）のために、少し後で戻す
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      setLasso(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  // ほかの場所のウィンドウから運んだものは移せない（パスは場所の中でしか使えないため）
  const rejectOtherPlace = (event: React.DragEvent) => {
    if (isFromOtherPlace(event.dataTransfer)) {
      showMessage("error", "ほかの場所（自分の PC・共有サーバー）のウィンドウからは移せません");
      return true;
    }
    return false;
  };

  // 背景（表示中のフォルダ）へのドロップ。このウィンドウの同じフォルダの行なら何もしない。
  // ほかのウィンドウ（FN0301-BR36）から運んだ行は、表示中のフォルダへ移す（Ctrl でコピー）
  const handleBackgroundDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropTarget(null);
    if (isNodeDrag(event)) {
      if (isDragFrom(currentPath) || rejectOtherPlace(event)) {
        return;
      }
      // すでにこのフォルダにあるものは除く
      const paths = draggedPaths(event.dataTransfer).filter((path) => parentPath(path) !== currentPath);
      if (paths.length > 0 && canDropInto(paths, currentPath)) {
        onDropNodes(paths, currentPath, wantsCopy(event));
      }
      return;
    }
    const files = await filesFromDrop(event.dataTransfer);
    if (files.length > 0) {
      onDropFiles(files, currentPath);
    }
  };

  const handleRowDrop = async (event: React.DragEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    if (isNodeDrag(event)) {
      if (rejectOtherPlace(event)) {
        return;
      }
      const paths = draggedPaths(event.dataTransfer);
      if (paths.length > 0 && canDropInto(paths, node.path)) {
        onDropNodes(paths, node.path, wantsCopy(event));
      }
      return;
    }
    const files = await filesFromDrop(event.dataTransfer);
    if (files.length > 0) {
      onDropFiles(files, node.path);
    }
  };

  return (
    <div
      // 一覧の幅で、出す列を変える（NARROW_HIDDEN）
      ref={listRef}
      // 下に余白を残す（ファイルが多くても、空いているところから囲み始められるように）
      className="@container relative min-h-0 flex-1 overflow-y-auto pb-16"
      onMouseDown={startLasso}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        // 空いているところのクリックで選択を外す
        if (event.target === event.currentTarget) {
          onSelectionChange(new Set());
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY }, null);
      }}
      onDragOver={(event) => {
        if (!isFileDrag(event) && !isNodeDrag(event)) {
          return;
        }
        event.preventDefault();
        // 行の移動は、このウィンドウの同じフォルダへは何もしない。ほかのウィンドウからなら表示中のフォルダへ移す
        if (isNodeDrag(event)) {
          if (isDragFrom(currentPath)) {
            event.dataTransfer.dropEffect = "none";
            setDropTarget(null);
            return;
          }
          event.dataTransfer.dropEffect = wantsCopy(event) ? "copy" : "move";
          setDropKind("nodes");
          setDropTarget(currentPath);
          return;
        }
        setDropKind("files");
        event.dataTransfer.dropEffect = "copy";
        setDropTarget(currentPath);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
          setDropTarget(null);
        }
      }}
      onDrop={handleBackgroundDrop}
    >
      {loading && nodes.length === 0 ? (
        <Spinner />
      ) : nodes.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={emptyTitle}
          description="「新しいフォルダ」「新しいファイル」で作るか、ファイル・フォルダをここにドラッグ＆ドロップしてアップロードできます"
        />
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      // 幅は 16px を 1rem として rem にする（文字の大きさの設定に合わせて広げる。FN0701-BR10）
                      style={header.column.id === "name" ? undefined : { width: `${header.column.getSize() / 16}rem` }}
                      className={twMerge(
                        "h-9 px-3 text-left text-xs font-medium text-muted-foreground",
                        header.column.id === "size" && "text-right",
                        header.column.id === "actions" && "pr-0 pl-1.5",
                        header.column.id === "select" && "pr-0 pl-3",
                        NARROW_HIDDEN[header.column.id],
                        // 並べ替えられる列は、見出しのセル全体をボタンにする（文字の外も押せるように）
                        header.column.getCanSort() && "p-0",
                      )}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={twMerge(
                            "flex h-9 w-full items-center gap-1 px-3 hover:bg-accent/60 hover:text-foreground",
                            header.column.id === "size" && "justify-end",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" && <ArrowUp size={12} />}
                          {sorted === "desc" && <ArrowDown size={12} />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.map((row) => {
              const node = row.original;
              const isSelected = selected.has(node.path);
              const folder = node.nodeType === NodeType.Folder;
              const isDropTarget = dropTarget === node.path && folder;
              return (
                <tr
                  key={row.id}
                  data-path={node.path}
                  aria-selected={isSelected}
                  draggable={renamingPath !== node.path}
                  className={twMerge(
                    "group cursor-default border-b border-border/60 select-none",
                    // 選んだ行は差し色の薄い背景（global.css の --selected。マウスを乗せたときの灰色と見分けやすく。エクスプローラーと同じ考え方）
                    isSelected ? "bg-selected" : "hover:bg-accent",
                    cutPaths.has(node.path) && "opacity-50",
                    isDropTarget && "bg-brand/10 outline-2 -outline-offset-2 outline-brand",
                  )}
                  onClick={(event) => {
                    select(node, event);
                    // ダブルクリックで開く。1 回目のクリックで選ぶと行の中身が描き直されて
                    // dblclick が届かないため、クリックの回数（detail）で見る
                    if (event.detail === 2 && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
                      onOpen(node);
                    }
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    // 選んでいないものを右クリックしたら、それだけを選ぶ（Windows のエクスプローラーと同じ）
                    if (!isSelected) {
                      anchor.current = node.path;
                      onSelectionChange(new Set([node.path]));
                    }
                    onMenu({ x: event.clientX, y: event.clientY }, node);
                  }}
                  onDragStart={(event) => {
                    const paths = isSelected ? [...selected] : [node.path];
                    if (!isSelected) {
                      onSelectionChange(new Set([node.path]));
                    }
                    startNodeDrag(event.dataTransfer, paths, currentPath);
                  }}
                  onDragEnd={() => {
                    endNodeDrag();
                    setDropTarget(null);
                  }}
                  onDragOver={(event) => {
                    if (!folder || (!isFileDrag(event) && !isNodeDrag(event))) {
                      return;
                    }
                    // ドラッグ中の行の中身は dragover では読めないため、選んでいる行を自分自身への移動とみなす
                    // （ほかのウィンドウから来たものは、ドロップしたときに確かめる）
                    if (isNodeDrag(event) && isDragFrom(currentPath) && !canDropInto([...selected], node.path)) {
                      return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = isNodeDrag(event) && !wantsCopy(event) ? "move" : "copy";
                    setDropTarget(node.path);
                  }}
                  onDrop={(event) => {
                    if (folder) {
                      void handleRowDrop(event, node);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      data-column={cell.column.id}
                      className={twMerge(
                        "h-10 px-3",
                        cell.column.id === "actions" && "pr-0 pl-1.5",
                        cell.column.id === "select" && "pr-0 pl-3",
                        NARROW_HIDDEN[cell.column.id],
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {lasso && (
        <div
          className="pointer-events-none absolute z-20 border border-brand bg-brand/10"
          style={{
            left: Math.min(lasso.x0, lasso.x1),
            top: Math.min(lasso.y0, lasso.y1),
            width: Math.abs(lasso.x1 - lasso.x0),
            height: Math.abs(lasso.y1 - lasso.y0),
          }}
        />
      )}

      {dropTarget === currentPath && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand bg-brand/5 text-sm font-medium text-brand">
          <Upload size={28} />
          {dropKind === "nodes" ? "ドロップしてこのフォルダへ移動（Ctrl でコピー）" : "ドロップしてこのフォルダにアップロード"}
        </div>
      )}
    </div>
  );
}

export default NodeTable;
