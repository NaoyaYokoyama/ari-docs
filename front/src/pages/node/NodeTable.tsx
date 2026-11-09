import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, EllipsisVertical, Eye, FolderOpen, Star, Upload } from "lucide-react";
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
import { canDropInto, draggedPaths, filesFromDrop, isFileDrag, isNodeDrag, NODE_DRAG_TYPE, wantsCopy } from "@/pages/node/nodeDrag";
import RenameInput from "@/pages/node/RenameInput";
import { FolderStatus, FolderStatusInfo } from "@/types/folderStatus";
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
  const { user } = useApp();
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  // ドロップ先。表示中のフォルダ（背景）は currentPath、フォルダの行はそのパス。null はドラッグしていない
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Shift で範囲を選ぶときの起点
  const anchor = useRef<string | null>(null);

  const columns = useMemo<ColumnDef<Node>[]>(
    () => [
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
      ...(user?.mode !== "local"
        ? ([
            {
              accessorKey: "status",
              header: "状態",
              cell: ({ getValue }) => {
                const info = FolderStatusInfo[getValue<FolderStatus>()];
                return info ? (
                  <span className="flex items-center gap-2">
                    <span className={info.color}>●</span>
                    <span>{info.label}</span>
                  </span>
                ) : null;
              },
            },
            {
              accessorKey: "updatedBy",
              header: "更新者",
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
    [user?.mode, renamingPath, onRenameEnd, onMenu, onPreview, selected, onSelectionChange],
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

  // 背景（表示中のフォルダ）へのドロップ。行の移動は同じフォルダなので何もしない
  const handleBackgroundDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropTarget(null);
    if (isNodeDrag(event)) {
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
      className="relative min-h-0 flex-1 overflow-y-auto"
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
        // 行の移動は、背景（同じフォルダ）へは何もしない
        if (isNodeDrag(event)) {
          event.dataTransfer.dropEffect = "none";
          setDropTarget(null);
          return;
        }
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
                    event.dataTransfer.setData(NODE_DRAG_TYPE, JSON.stringify(paths));
                    event.dataTransfer.effectAllowed = "copyMove";
                  }}
                  onDragEnd={() => setDropTarget(null)}
                  onDragOver={(event) => {
                    if (!folder || (!isFileDrag(event) && !isNodeDrag(event))) {
                      return;
                    }
                    // ドラッグ中の行の中身は dragover では読めないため、選んでいる行を自分自身への移動とみなす
                    if (isNodeDrag(event) && !canDropInto([...selected], node.path)) {
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
                    <td key={cell.id} className={twMerge("h-10 px-3", cell.column.id === "actions" && "pr-0 pl-1.5")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {dropTarget === currentPath && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand bg-brand/5 text-sm font-medium text-brand">
          <Upload size={28} />
          ドロップしてこのフォルダにアップロード
        </div>
      )}
    </div>
  );
}

export default NodeTable;
