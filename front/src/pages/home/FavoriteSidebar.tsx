import { BookOpen, FileText, Folder, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getFavorites } from "@/api/home";
import EmptyState from "@/components/common/EmptyState";
import PageSidebar from "@/components/common/PageSidebar";
import Spinner from "@/components/common/Spinner";
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

function FavoriteSidebar() {
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getFavorites()
      .then((response) => setFavorites(response.favoriteList))
      .catch((error) => {
        console.error("お気に入りの取得に失敗しました", error);
        setFavorites([]);
      });
  }, []);

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
          {favorites.map((favorite) => {
            const Icon = iconOf(favorite);
            const [name, parent] = favorite.nodeId
              ? splitPath(favorite.name)
              : [favorite.name, ""];
            return (
              <li key={favorite.favoriteId}>
                <button
                  type="button"
                  onClick={() => open(favorite)}
                  title={favorite.name}
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
