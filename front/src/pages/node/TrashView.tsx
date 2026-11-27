import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { deleteTrash, emptyTrash, getTrash, restoreTrash } from "@/api/trash";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import ContextMenu, { type ContextMenuItem } from "@/components/common/ContextMenu";
import EmptyState from "@/components/common/EmptyState";
import Spinner from "@/components/common/Spinner";
import { fileKind, formatSize } from "@/lib/fileType";
import { errorMessage, formatDateTime } from "@/lib/format";
import RestoreDestinationDialog from "@/pages/node/RestoreDestinationDialog";
import { isShortcut, SHORTCUT } from "@/shortcut/shortcut";
import type { TrashResponse } from "@/types/trash";

type Props = {
  // 元に戻したら、そのフォルダを開けるようにする
  onRestored: (paths: string[]) => void;
};

// ゴミ箱（FN0302）。削除したファイル・フォルダを元に戻す・完全に削除する
export default function TrashView({ onRestored }: Props) {
  const { showMessage, showConfirm } = useApp();
  const [trash, setTrash] = useState<TrashResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Shift で範囲を選ぶときの起点と、キーで動かしている行
  const [anchor, setAnchor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  // 元のフォルダが無いものを戻すとき、戻す場所を選ぶ（FN0302-BR10）
  const [asking, setAsking] = useState<string[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    getTrash()
      .then((response) => {
        setTrash(response);
        setSelected(new Set());
        setAnchor(null);
        setCursor(null);
      })
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "ゴミ箱を読み込めませんでした"));
      });
  }, [showMessage]);

  useEffect(load, [load]);

  const ids = [...selected];

  const restore = async (targets: string[], destination?: string | null) => {
    if (targets.length === 0) {
      return;
    }
    // 元のフォルダが無いものがあれば、先に戻す場所を聞く
    if (destination === undefined) {
      const missing = (trash?.items ?? []).filter((item) => targets.includes(item.trashId) && !item.parentExists);
      if (missing.length > 0) {
        setAsking(targets);
        return;
      }
    }
    try {
      const response = await restoreTrash(targets, destination ?? undefined);
      showMessage("info", response.message);
      onRestored(response.data);
    } catch (error) {
      showMessage("error", errorMessage(error, "元に戻せませんでした"));
    }
    load();
  };

  const remove = async (targets: string[]) => {
    if (targets.length === 0) {
      return;
    }
    if (!(await showConfirm(`${targets.length} 件を完全に削除しますか？元には戻せません`))) {
      return;
    }
    try {
      showMessage("info", (await deleteTrash(targets)).message);
    } catch (error) {
      showMessage("error", errorMessage(error, "削除できませんでした"));
    }
    load();
  };

  const empty = async () => {
    if (!(await showConfirm("ゴミ箱を空にしますか？中のものはすべて完全に削除され、元には戻せません"))) {
      return;
    }
    try {
      showMessage("info", (await emptyTrash()).message);
    } catch (error) {
      showMessage("error", errorMessage(error, "ゴミ箱を空にできませんでした"));
    }
    load();
  };

  const order = (trash?.items ?? []).map((item) => item.trashId);

  // クリックで選ぶ。Ctrl で 1 つずつ足し引き、Shift で起点からの範囲（Folder の一覧と同じ。FN0302-BR02）
  const select = (trashId: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const toggle = event.ctrlKey || event.metaKey;
    if (event.shiftKey && anchor && order.includes(anchor)) {
      const [from, to] = [order.indexOf(anchor), order.indexOf(trashId)].sort((a, b) => a - b);
      const range = order.slice(from, to + 1);
      setSelected(new Set(toggle ? [...selected, ...range] : range));
    } else if (toggle) {
      const next = new Set(selected);
      if (next.has(trashId)) {
        next.delete(trashId);
      } else {
        next.add(trashId);
      }
      setSelected(next);
      setAnchor(trashId);
    } else {
      setSelected(new Set([trashId]));
      setAnchor(trashId);
    }
    setCursor(trashId);
  };

  // 一覧のキー（↑↓ で選ぶ、Shift+↑↓ で広げる、Ctrl+A ですべて、Enter で元に戻す、Delete で完全に削除）
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented || order.length === 0) {
      return;
    }
    const key = event.key;
    if (isShortcut(event.nativeEvent, SHORTCUT.FOLDER_SELECT_ALL)) {
      event.preventDefault();
      setSelected(new Set(order));
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const at = cursor ? order.indexOf(cursor) : -1;
      const next = order[Math.min(Math.max(at + (key === "ArrowDown" ? 1 : -1), 0), order.length - 1)];
      select(next, { ctrlKey: false, metaKey: false, shiftKey: event.shiftKey });
      if (!event.shiftKey) {
        setAnchor(next);
      }
      document.getElementById(`trash-row-${next}`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (key === "Enter" && ids.length > 0) {
      event.preventDefault();
      void restore(ids);
    } else if (isShortcut(event.nativeEvent, SHORTCUT.FOLDER_DELETE) && ids.length > 0 && trash?.canDelete) {
      event.preventDefault();
      void remove(ids);
    } else if (key === "Escape" && ids.length > 0) {
      event.preventDefault();
      setSelected(new Set());
    }
  };

  const menuItems: ContextMenuItem[] = [
    { label: "元に戻す", icon: RotateCcw, onSelect: () => void restore(ids) },
    ...(trash?.canDelete
      ? ([
          "separator",
          { label: "完全に削除", icon: Trash2, danger: true, onSelect: () => void remove(ids) },
        ] as ContextMenuItem[])
      : []),
  ];

  if (!trash) {
    return <Spinner />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Trash2 size={16} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">ゴミ箱</h2>
        <span className="text-xs text-muted-foreground">
          {ids.length > 1
            ? `${ids.length} 件を選んでいます`
            : `削除したものは ${trash.retentionDays} 日たつと自動で消えます`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="secondary" size="sm" disabled={ids.length === 0} onClick={() => void restore(ids)}>
            <RotateCcw size={15} />
            元に戻す
          </Button>
          {trash.canDelete && (
            <>
              <Button variant="secondary" size="sm" disabled={ids.length === 0} onClick={() => void remove(ids)}>
                <Trash2 size={15} />
                完全に削除
              </Button>
              <Button variant="danger" size="sm" disabled={trash.items.length === 0} onClick={() => void empty()}>
                ゴミ箱を空にする
              </Button>
            </>
          )}
        </div>
      </div>

      {!trash.canDelete && (
        <p className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <TriangleAlert size={14} />
          完全に削除できるのは管理者だけです。元に戻すことは誰でもできます。
        </p>
      )}

      {trash.items.length === 0 ? (
        <EmptyState icon={Trash2} title="ゴミ箱は空です" description="フォルダ画面で削除したファイル・フォルダはここに入り、元に戻せます" />
      ) : (
        <div
          ref={listRef}
          tabIndex={0}
          role="grid"
          aria-label="ゴミ箱の中のもの"
          aria-multiselectable
          onKeyDown={handleKeyDown}
          className="min-h-0 flex-1 overflow-y-auto outline-none"
        >
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="h-9 px-3 font-medium">名前</th>
                <th className="h-9 w-[30%] px-3 font-medium">元の場所</th>
                <th className="h-9 w-40 px-3 font-medium">削除した日時</th>
                <th className="h-9 w-32 px-3 font-medium">削除した人</th>
                <th className="h-9 w-24 px-3 text-right font-medium">サイズ</th>
              </tr>
            </thead>
            <tbody>
              {trash.items.map((item) => {
                const folder = item.nodeType === "folder";
                const { icon: Icon, className } = fileKind(item.name, folder);
                const isSelected = selected.has(item.trashId);
                const parent = item.originalPath.includes("/")
                  ? item.originalPath.slice(0, item.originalPath.lastIndexOf("/"))
                  : "";
                return (
                  <tr
                    key={item.trashId}
                    id={`trash-row-${item.trashId}`}
                    aria-selected={isSelected}
                    className={twMerge(
                      "cursor-default border-b border-border/60 select-none",
                      isSelected ? "bg-selected" : "hover:bg-accent",
                    )}
                    onClick={(event) => {
                      listRef.current?.focus();
                      select(item.trashId, event);
                    }}
                    onDoubleClick={() => void restore([item.trashId])}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (!isSelected) {
                        setSelected(new Set([item.trashId]));
                        setAnchor(item.trashId);
                        setCursor(item.trashId);
                      }
                      setMenu({ x: event.clientX, y: event.clientY });
                    }}
                  >
                    <td className="h-10 px-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon size={17} className={twMerge("shrink-0", className)} />
                        <span className="truncate" title={item.name}>
                          {item.name}
                        </span>
                      </span>
                    </td>
                    <td className="truncate px-3 text-muted-foreground" title={`folder/${parent}`}>
                      {item.parentExists ? (
                        `folder/${parent}`
                      ) : (
                        <span className="flex min-w-0 items-center gap-1">
                          <TriangleAlert size={13} className="shrink-0 text-warning" aria-label="元のフォルダがありません" />
                          <span className="truncate">folder/{parent}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 text-muted-foreground tabular-nums">{formatDateTime(item.deletedAt)}</td>
                    <td className="truncate px-3 text-muted-foreground">{item.deletedBy}</td>
                    <td className="px-3 text-right text-muted-foreground tabular-nums">{formatSize(item.size)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ContextMenu position={menu} items={menuItems} onClose={() => setMenu(null)} />

      <RestoreDestinationDialog
        missing={
          asking &&
          trash.items
            .filter((item) => asking.includes(item.trashId) && !item.parentExists)
            .map((item) => item.originalPath)
        }
        total={asking?.length ?? 0}
        onClose={() => setAsking(null)}
        onChoose={(destination) => {
          const targets = asking ?? [];
          setAsking(null);
          void restore(targets, destination);
        }}
      />
    </div>
  );
}
