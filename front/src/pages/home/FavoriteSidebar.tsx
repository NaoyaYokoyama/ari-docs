import {
  BookOpen,
  FileText,
  Folder,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getFavorites } from "@/api/home";
import type { Favorite } from "@/types/favorite";

function FavoriteSidebar() {
  const [favorites, setFavorites] =
    useState<Favorite[]>([]);

  const navigate = useNavigate();

  const loadFavorites = async () => {
    try {
      const response = await getFavorites();
      setFavorites(response.favoriteList);
    } catch (error) {
      console.error(
        "お気に入りの取得に失敗しました",
        error,
      );
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const handleNavigate = (
    favorite: Favorite,
  ) => {
    if (favorite.wikiId) {
      navigate("/wiki", {
        state: {
          wikiId: favorite.wikiId,
        },
      });
      return;
    }

    if (favorite.noteId) {
      navigate("/note", {
        state: {
          noteId: favorite.noteId,
        },
      });
      return;
    }

    // ノードのお気に入りはnameにパスが入っている
    if (favorite.nodeId) {
      navigate("/folder", {
        state: {
          nodePath: favorite.name,
        },
      });
    }
  };

  return (
    <aside
      className="
        w-64 shrink-0
        border-r border-slate-200
        bg-slate-50
        px-5 py-6
      "
    >
      <div className="mb-5 flex items-center gap-2">
        <Star size={18} />
        <h2 className="font-semibold">
          お気に入り
        </h2>
      </div>

      <div className="space-y-1">
        {favorites.map((favorite) => (
          <div
            key={`${favorite.nodeId}-${favorite.noteId}-${favorite.wikiId}`}
            onClick={() =>
              handleNavigate(favorite)
            }
            className="
              flex cursor-pointer
              items-center gap-3
              rounded-md
              px-3 py-2
              hover:bg-slate-200
            "
          >
            {favorite.wikiId && (
              <BookOpen size={18} />
            )}

            {favorite.noteId && (
              <FileText size={18} />
            )}

            {favorite.nodeId && (
              <Folder size={18} />
            )}

            <div
              className="truncate"
              title={favorite.name}
            >
              {favorite.nodeId
                ? favorite.name.split("/").pop()
                : favorite.name}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default FavoriteSidebar;
