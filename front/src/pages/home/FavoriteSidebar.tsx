import { BookOpen, FileText, Folder, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import { updateFavoriteOrder } from "@/api/favorite";
import { getFavorites } from "@/api/home";
import { useApp } from "@/app/AppContext";
import EmptyState from "@/components/common/EmptyState";
import PageSidebar from "@/components/common/PageSidebar";
import Spinner from "@/components/common/Spinner";
import { errorMessage } from "@/lib/format";
import { splitPath, targetOf } from "@/pages/home/openTarget";
import type { Favorite } from "@/types/favorite";

function iconOf(favorite: Favorite) {
  if (favorite.wikiId) {
    return BookOpen;
  }
  if (favorite.noteId) {
    return FileText;
  }
  // ノードのお気に入りは種類を返さないため、拡張子の有無で見分ける
  return /\.[^/]+$/.test(favorite.name) ? FileText : Folder;
}

// 並びを変える。from の項目を to の位置へ
function moved<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function FavoriteSidebar() {
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  const navigate = useNavigate();
  const { showMessage } = useApp();
  // ドラッグしている行と、落とす先の行（FN0601-BR08）
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const load = () =>
    getFavorites()
      .then((response) => setFavorites(response.favoriteList))
      .catch((error) => {
        console.error("お気に入りの取得に失敗しました", error);
        setFavorites([]);
      });

  useEffect(() => {
    void load();
  }, []);

  // 並べ替えて、サーバーに覚えさせる。失敗したら読み直す
  const reorder = (from: number, to: number) => {
    if (!favorites || from === to || to < 0 || to >= favorites.length) {
      return;
    }
    const next = moved(favorites, from, to);
    setFavorites(next);
    updateFavoriteOrder(next.map((favorite) => favorite.favoriteId)).catch((error) => {
      showMessage("error", errorMessage(error, "並べ替えを保存できませんでした"));
      void load();
    });
  };

  const open = (favorite: Favorite) => {
    const target = targetOf(favorite);
    if (target) {
      navigate(...target);
    }
  };

  return (
    <PageSidebar
      title={
        <span className="flex items-center gap-2">
          <Star size={15} className="fill-warning text-warning" />
          お気に入り
        </span>
      }
    >
      {favorites === null ? (
        <Spinner />
      ) : favorites.length === 0 ? (
        <EmptyState
          icon={Star}
          title="お気に入りはまだありません"
          description="Note・Wiki・ファイルの ☆ から追加できます"
          className="py-8"
        />
      ) : (
        <ul className="space-y-0.5">
          {favorites.map((favorite, index) => {
            const Icon = iconOf(favorite);
            const [name, parent] = favorite.nodeId
              ? splitPath(favorite.name)
              : [favorite.name, ""];
            return (
              <li
                key={favorite.favoriteId}
                // ドラッグで並べ替える（FN0601-BR08）
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDragIndex(index);
                }}
                onDragOver={(event) => {
                  if (dragIndex !== null) {
                    event.preventDefault();
                    setOverIndex(index);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null) {
                    reorder(dragIndex, index);
                  }
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={twMerge(
                  "rounded-md",
                  dragIndex === index && "opacity-50",
                  overIndex === index && dragIndex !== null && dragIndex !== index && "ring-2 ring-brand/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => open(favorite)}
                  // Alt+↑・↓ でも並べ替える（キーボードだけで使えるように）
                  onKeyDown={(event) => {
                    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                      event.preventDefault();
                      const to = index + (event.key === "ArrowUp" ? -1 : 1);
                      reorder(index, to);
                      const list = event.currentTarget.closest("ul");
                      requestAnimationFrame(() =>
                        list?.querySelectorAll<HTMLButtonElement>("button")[to]?.focus(),
                      );
                    }
                  }}
                  title={`${favorite.name}（ドラッグか Alt+↑↓ で並べ替え）`}
                  // Vim モードでサイドバーの行として j・k で動く（FN0702）
                  data-vim-item
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Icon size={16} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{name}</span>
                    {parent && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {parent}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PageSidebar>
  );
}

export default FavoriteSidebar;
