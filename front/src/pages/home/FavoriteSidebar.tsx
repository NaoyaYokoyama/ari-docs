import { useState, useEffect } from "react";
import { Star, Folder, FileText, BookOpen } from "lucide-react";
import type { FavoriteList, Favorite} from "@/types/favorite";
import { getFavorites } from "@/api/home";

function FavoriteSidebar() {

  const [favorites, setFavorites] = useState<FavoriteList[]>([]);
  const loadFavorites = async () => {
    try {
      const response = await getFavorites();
      setFavorites(response.favoriteList);
    } catch (error) {
      console.error("お気に入りの取得に失敗しました", error);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 px-5 py-6">
      <div className="mb-5 flex items-center gap-2">
        <Star size={18} />
        <h2 className="font-semibold">お気に入り</h2>
      </div>

      <div className="space-y-1">

        {favorites.map((favorite) => (
          <div className="flex gap-3 items-center px-3">
            {favorite.wikiId && <BookOpen size={18} />}
            {favorite.noteId && <FileText size={18} />}
            {favorite.nodeId && <Folder size={18} />}
            <div>
              <div>{favorite.name}</div>
            </div>
          </div>
        ))}

      </div>
    </aside>
  );
}

export default FavoriteSidebar;
