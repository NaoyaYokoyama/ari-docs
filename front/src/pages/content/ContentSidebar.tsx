import {
  ArrowDownAZ,
  CalendarClock,
  ChevronRight,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useCopyAriLink } from "@/app/useAriLink";
import ContextMenu, { type ContextMenuItem } from "@/components/common/ContextMenu";
import EmptyState from "@/components/common/EmptyState";
import IconButton from "@/components/common/IconButton";
import PageSidebar from "@/components/common/PageSidebar";
import Spinner from "@/components/common/Spinner";
import { formatDateTime, formatRelative, normalizeText } from "@/lib/format";
import type { ContentItem, ContentKind } from "@/pages/content/contentKinds";
import {
  ancestors,
  folderPath,
  isInside,
  type Row,
  rowKey,
  type Sort,
  sortItems,
  visibleRows,
} from "@/pages/content/contentTree";
import type { ContentFoldersState } from "@/pages/content/useContentFolders";
import { SHORTCUT, shortcutLabel } from "@/shortcut/shortcut";
import type { ContentFolder } from "@/types/contentFolder";
import { useVimHandlers } from "@/vim/vimHandlers";

const SORT_KEY = "content-sort";
// 行をドラッグしたときの dataTransfer の種類（OS のファイルのドロップと見分ける）
const DRAG_TYPE = "application/x-ari-content";

function readSort(): Sort {
  try {
    return localStorage.getItem(SORT_KEY) === "title" ? "title" : "updated";
  } catch {
    return "updated";
  }
}

// 開いているフォルダはこの PC に覚える（FN0403-BR04）
function openKey(kind: ContentKind) {
  return `content-open-folders-${kind.kind}`;
}

function readOpen(kind: ContentKind): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(openKey(kind)) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export type MoveTarget = {
  label: string;
  folderIds: string[];
  itemIds: string[];
  currentFolderId: string;
};

type Props = {
  kind: ContentKind;
  items: ContentItem[] | null;
  folders: ContentFoldersState;
  selectedId: string;
  // 新しく作る場所（クリックしたフォルダ・開いているものの入っているフォルダ）
  currentFolderId: string;
  onCurrentFolderChange: (folderId: string) => void;
  onSelect: (id: string) => void;
  onCreate: (folderId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onRenameFolder: (folder: ContentFolder) => void;
  onMoveRequest: (target: MoveTarget) => void;
};

type Menu = { position: { x: number; y: number }; row: Row | null };

// Note・Wiki の一覧（フォルダの木。FN0403）。絞り込み中はフォルダを開かずに、一致したものを場所と並べる
const ContentSidebar = forwardRef<HTMLElement, Props>(function ContentSidebar(
  {
    kind,
    items,
    folders,
    selectedId,
    currentFolderId,
    onCurrentFolderChange,
    onSelect,
    onCreate,
    onCreateFolder,
    onRenameFolder,
    onMoveRequest,
  },
  ref,
) {
  const { tree } = folders;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>(readSort);
  const [open, setOpen] = useState<Set<string>>(() => readOpen(kind));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [menu, setMenu] = useState<Menu | null>(null);
  // ドロップ先のフォルダ（'' は一番上）。null はドラッグしていない
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // ドラッグ中のもの（dragover では dataTransfer の中身を読めないため）
  const dragging = useRef<{ folderIds: string[]; itemIds: string[] } | null>(null);

  const filtering = query.trim() !== "";

  const rows = useMemo<Row[]>(() => {
    if (!filtering) {
      return visibleRows(tree, items ?? [], sort, open);
    }
    const terms = normalizeText(query).split(/\s+/).filter(Boolean);
    return sortItems(
      (items ?? []).filter((item) => terms.every((term) => normalizeText(item.title).includes(term))),
      sort,
    ).map((item) => ({ type: "item", item, depth: 0, folderId: tree.folderOf.get(item.id) ?? "" }));
  }, [filtering, tree, items, sort, open, query]);

  const changeOpen = (update: (next: Set<string>) => void) => {
    setOpen((current) => {
      const next = new Set(current);
      update(next);
      try {
        localStorage.setItem(openKey(kind), JSON.stringify([...next]));
      } catch {
        // 覚えられなくても開け閉めはする
      }
      return next;
    });
  };

  // 開いたもの（ホーム・お気に入りから開いたときも）が見えるよう、入っているフォルダを開く
  useEffect(() => {
    const folderId = tree.folderOf.get(selectedId);
    if (folderId) {
      const parents = ancestors(tree, folderId);
      if (parents.some((id) => !open.has(id))) {
        changeOpen((next) => parents.forEach((id) => next.add(id)));
      }
    }
    // open を見ると、閉じたときにまた開いてしまう
  }, [selectedId, tree]);

  // 選んだものにキーボードの位置を合わせる
  useEffect(() => {
    const index = rows.findIndex((row) => row.type === "item" && row.item.id === selectedId);
    if (index !== -1) {
      setFocusedIndex(index);
    }
  }, [rows, selectedId]);

  // キーボードで動かした行が見えるようにする
  useEffect(() => {
    const row = rows[focusedIndex];
    if (row) {
      document.getElementById(`content-row-${rowKey(row)}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [rows, focusedIndex]);

  const changeSort = (next: Sort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      // 保存できなくても並べ替えはする
    }
  };

  const toggle = (folder: ContentFolder, value?: boolean) => {
    const next = value ?? !open.has(folder.folderId);
    changeOpen((set) => (next ? set.add(folder.folderId) : set.delete(folder.folderId)));
  };

  const activate = (row: Row, index: number) => {
    setFocusedIndex(index);
    if (row.type === "folder") {
      toggle(row.folder);
      onCurrentFolderChange(row.folder.folderId);
    } else {
      onSelect(row.item.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (rows.length === 0 || e.target !== e.currentTarget || e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }
    const row = rows[focusedIndex];
    const move = (index: number) => setFocusedIndex(Math.min(Math.max(index, 0), rows.length - 1));

    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      move(focusedIndex + 1);
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      move(focusedIndex - 1);
    } else if (e.key === "Enter" && row) {
      e.preventDefault();
      activate(row, focusedIndex);
    } else if ((e.key === "l" || e.key === "ArrowRight") && row?.type === "folder") {
      // 閉じていれば開き、開いていれば中の最初の行へ
      e.preventDefault();
      if (row.open) {
        move(focusedIndex + 1);
      } else {
        toggle(row.folder, true);
      }
      onCurrentFolderChange(row.folder.folderId);
    } else if ((e.key === "h" || e.key === "ArrowLeft") && row) {
      // 開いたフォルダなら閉じ、それ以外は入っているフォルダへ
      e.preventDefault();
      if (row.type === "folder" && row.open) {
        toggle(row.folder, false);
        return;
      }
      const parentId = row.type === "folder" ? row.folder.parentId : row.folderId;
      const parentIndex = rows.findIndex(
        (other) => other.type === "folder" && other.folder.folderId === parentId,
      );
      if (parentIndex !== -1) {
        move(parentIndex);
      }
    }
  };

  // Vim モード（FN0702）: 一覧にフォーカスしているとき、gg・G・d・u で一覧の中を動く（j・k は上の handleKeyDown）
  const asideRef = useRef<HTMLElement | null>(null);
  const inList = () => !!asideRef.current && document.activeElement === asideRef.current;
  const jump = (index: (length: number) => number) => {
    if (!inList() || rows.length === 0) {
      return false;
    }
    setFocusedIndex(Math.min(Math.max(index(rows.length), 0), rows.length - 1));
  };
  useVimHandlers({
    top: () => jump(() => 0),
    bottom: () => jump((length) => length - 1),
    halfDown: (count) => jump(() => focusedIndex + 10 * count),
    halfUp: (count) => jump(() => focusedIndex - 10 * count),
  });

  // ドラッグしたものを destId へ移せるか（フォルダを自分の中へは移せない）
  const canDrop = (destId: string) => {
    const moving = dragging.current;
    if (!moving) {
      return false;
    }
    return !moving.folderIds.some((folderId) => isInside(tree, destId, folderId));
  };

  const dropProps = (destId: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE) || !canDrop(destId)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(destId);
    },
    onDrop: (event: React.DragEvent) => {
      const moving = dragging.current;
      if (!moving || !canDrop(destId)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(null);
      dragging.current = null;
      // 同じ場所へのドロップは何もしない
      const unchanged =
        moving.folderIds.every((id) => tree.folders.get(id)?.parentId === destId) &&
        moving.itemIds.every((id) => (tree.folderOf.get(id) ?? "") === destId);
      if (!unchanged) {
        void folders.move(moving.folderIds, moving.itemIds, destId);
      }
    },
  });

  const dragProps = (row: Row) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      const moving =
        row.type === "folder"
          ? { folderIds: [row.folder.folderId], itemIds: [] }
          : { folderIds: [], itemIds: [row.item.id] };
      dragging.current = moving;
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(moving));
      event.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => {
      dragging.current = null;
      setDropTarget(null);
    },
  });

  const moveTarget = (row: Row): MoveTarget =>
    row.type === "folder"
      ? {
          label: row.folder.name,
          folderIds: [row.folder.folderId],
          itemIds: [],
          currentFolderId: row.folder.parentId,
        }
      : { label: row.item.title, folderIds: [], itemIds: [row.item.id], currentFolderId: row.folderId };

  // ari-docs の中のリンク（FN0004）
  const copyAriLink = useCopyAriLink();

  const menuItems = (row: Row | null): ContextMenuItem[] => {
    if (!row) {
      return [
        { label: `新しい${kind.label}`, icon: Plus, onSelect: () => onCreate("") },
        { label: "新しいフォルダ", icon: FolderPlus, onSelect: () => onCreateFolder("") },
      ];
    }
    if (row.type === "item") {
      return [
        {
          label: "リンクをコピー",
          icon: Link2,
          onSelect: () => void copyAriLink([{ kind: kind.kind, id: row.item.id }], row.item.title),
        },
        { label: "移動...", icon: FolderInput, onSelect: () => onMoveRequest(moveTarget(row)) },
        "separator",
        { label: `新しい${kind.label}（同じ場所に）`, icon: Plus, onSelect: () => onCreate(row.folderId) },
      ];
    }
    const folder = row.folder;
    return [
      { label: `新しい${kind.label}（この中に）`, icon: Plus, onSelect: () => onCreate(folder.folderId) },
      { label: "新しいフォルダ（この中に）", icon: FolderPlus, onSelect: () => onCreateFolder(folder.folderId) },
      "separator",
      { label: "名前の変更", icon: Pencil, onSelect: () => onRenameFolder(folder) },
      { label: "移動...", icon: FolderInput, onSelect: () => onMoveRequest(moveTarget(row)) },
      "separator",
      { label: "削除", icon: Trash2, danger: true, onSelect: () => void folders.remove(folder) },
    ];
  };

  const ItemIcon = kind.icon;
  const empty = items !== null && items.length === 0 && tree.folders.size === 0;

  return (
    <PageSidebar
      ref={(element) => {
        asideRef.current = element;
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      }}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
      title={
        <span className="flex items-center gap-2">
          {kind.label}
          {items && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.6875rem] font-normal text-muted-foreground">
              {items.length}
            </span>
          )}
        </span>
      }
      actions={
        <span className="flex items-center">
          <IconButton
            label={`新しいフォルダ${currentFolderId ? `（「${tree.folders.get(currentFolderId)?.name ?? ""}」の中に）` : ""}`}
            onClick={() => onCreateFolder(currentFolderId)}
          >
            <FolderPlus size={17} />
          </IconButton>
          <IconButton
            label={`新しい${kind.label}（${shortcutLabel(SHORTCUT.CREATE)}）`}
            onClick={() => onCreate(currentFolderId)}
          >
            <Plus size={17} />
          </IconButton>
        </span>
      }
      toolbar={
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusedIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                }
                const first = rows.find((row) => row.type === "item");
                if (e.key === "Enter" && !e.nativeEvent.isComposing && first?.type === "item") {
                  onSelect(first.item.id);
                }
              }}
              // Vim モードの / で移る（FN0702）
              data-vim-filter
              placeholder="タイトルで絞り込み"
              className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <IconButton
            label={sort === "updated" ? "更新日の新しい順（クリックで名前順）" : "名前順（クリックで更新日順）"}
            onClick={() => changeSort(sort === "updated" ? "title" : "updated")}
          >
            {sort === "updated" ? <CalendarClock size={16} /> : <ArrowDownAZ size={16} />}
          </IconButton>
        </div>
      }
    >
      {items === null || folders.data === null ? (
        <Spinner />
      ) : empty ? (
        <EmptyState
          icon={kind.icon}
          title={`${kind.label}はまだありません`}
          description={`右上の ＋ から作成できます`}
          className="py-8"
        />
      ) : filtering && rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          該当する{kind.label}はありません
        </p>
      ) : (
        <ul
          // 空いているところは一番上へのドロップ先・右クリックで作成
          {...(filtering ? {} : dropProps(""))}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropTarget(null);
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ position: { x: event.clientX, y: event.clientY }, row: null });
          }}
          className={twMerge(
            "min-h-full space-y-px rounded-md pb-8",
            dropTarget === "" && "bg-brand/5 outline-2 -outline-offset-2 outline-brand",
          )}
        >
          {rows.map((row, index) => {
            const key = rowKey(row);
            const focused = index === focusedIndex;
            const indent = { paddingLeft: `${0.5 + row.depth * 0.875}rem` };
            const openMenu = (event: React.MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              setFocusedIndex(index);
              setMenu({ position: { x: event.clientX, y: event.clientY }, row });
            };

            if (row.type === "folder") {
              const current = row.folder.folderId === currentFolderId;
              const Icon = row.open ? FolderOpen : Folder;
              return (
                <li key={key}>
                  <button
                    id={`content-row-${key}`}
                    type="button"
                    tabIndex={-1}
                    aria-expanded={row.open}
                    onClick={() => activate(row, index)}
                    onContextMenu={openMenu}
                    {...dragProps(row)}
                    {...dropProps(row.folder.folderId)}
                    style={indent}
                    className={twMerge(
                      "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-accent/60",
                      focused && "ring-1 ring-border ring-inset",
                      dropTarget === row.folder.folderId && "bg-brand/10 outline-2 -outline-offset-2 outline-brand",
                    )}
                  >
                    <ChevronRight
                      size={14}
                      className={twMerge(
                        "shrink-0 text-muted-foreground transition-transform",
                        row.open && "rotate-90",
                      )}
                    />
                    <Icon
                      size={15}
                      className={twMerge("shrink-0", current ? "text-brand" : "text-muted-foreground")}
                    />
                    <span className={twMerge("min-w-0 flex-1 truncate", current && "font-medium")}>
                      {row.folder.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {row.count}
                    </span>
                  </button>
                </li>
              );
            }

            const selected = row.item.id === selectedId;
            return (
              <li key={key}>
                <button
                  id={`content-row-${key}`}
                  type="button"
                  tabIndex={-1}
                  onClick={() => activate(row, index)}
                  onContextMenu={openMenu}
                  {...(filtering ? {} : dragProps(row))}
                  {...(filtering ? {} : dropProps(row.folderId))}
                  // アイコンをフォルダのアイコンと揃える
                  style={filtering ? undefined : { paddingLeft: `${1.75 + row.depth * 0.875}rem` }}
                  className={twMerge(
                    "relative flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left transition-colors",
                    filtering && "flex-col items-start gap-0 px-3",
                    selected ? "bg-accent" : "hover:bg-accent/60",
                    focused && !selected && "ring-1 ring-border ring-inset",
                  )}
                >
                  {selected && (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />
                  )}
                  {!filtering && <ItemIcon size={15} className="shrink-0 text-muted-foreground" />}
                  <span
                    className={twMerge(
                      "min-w-0 flex-1 truncate text-sm",
                      filtering && "w-full flex-none",
                      selected && "font-medium",
                    )}
                  >
                    {row.item.title || "（無題）"}
                  </span>
                  <span
                    className={twMerge(
                      "shrink-0 text-xs text-muted-foreground",
                      filtering && "w-full truncate",
                    )}
                    title={formatDateTime(row.item.updatedAt)}
                  >
                    {filtering && row.folderId
                      ? `${folderPath(tree, row.folderId)} ・ ${formatRelative(row.item.updatedAt)}`
                      : formatRelative(row.item.updatedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ContextMenu
        position={menu?.position ?? null}
        items={menu ? menuItems(menu.row) : []}
        onClose={() => setMenu(null)}
      />
    </PageSidebar>
  );
});

export default ContentSidebar;
