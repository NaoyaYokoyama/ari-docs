import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { deleteTrash, emptyTrash, getTrash, restoreTrash } from "@/api/trash";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import ContextMenu, { type ContextMenuItem } from "@/components/common/ContextMenu";
import EmptyState from "@/components/common/EmptyState";
import Spinner from "@/components/common/Spinner";
import { fileKind, formatSize } from "@/lib/fileType";
import { errorMessage, formatDateTime } from "@/lib/format";
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

  const load = useCallback(() => {
    getTrash()
      .then((response) => {
        setTrash(response);
        setSelected(new Set());
      })
      .catch((error) => {
        console.error(error);
        showMessage("error", errorMessage(error, "ゴミ箱を読み込めませんでした"));
      });
  }, [showMessage]);

  useEffect(load, [load]);

  const ids = [...selected];

  const restore = async (targets: string[]) => {
    if (targets.length === 0) {
      return;
    }
    try {
      const response = await restoreTrash(targets);
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
          削除したものは {trash.retentionDays} 日たつと自動で消えます
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
        <div className="min-h-0 flex-1 overflow-y-auto">
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
                    aria-selected={isSelected}
                    className={twMerge(
                      "cursor-default border-b border-border/60 select-none",
                      isSelected ? "bg-selected" : "hover:bg-accent",
                    )}
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey) {
                        const next = new Set(selected);
                        if (next.has(item.trashId)) {
                          next.delete(item.trashId);
                        } else {
                          next.add(item.trashId);
                        }
                        setSelected(next);
                      } else {
                        setSelected(new Set([item.trashId]));
                      }
                    }}
                    onDoubleClick={() => void restore([item.trashId])}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (!isSelected) {
                        setSelected(new Set([item.trashId]));
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
                      folder/{parent}
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
    </div>
  );
}
