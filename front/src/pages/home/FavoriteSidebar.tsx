import { Star, Folder, FileText, BookOpen } from "lucide-react";

function FavoriteSidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-slate-50 px-5 py-6">
      <div className="mb-5 flex items-center gap-2">
        <Star size={18} />
        <h2 className="font-semibold">お気に入り</h2>
      </div>

      <div className="space-y-1">
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-slate-200">
          <Folder size={18} />
          <span>プロジェクト資料</span>
        </button>

        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-slate-200">
          <FileText size={18} />
          <span>基本設計書.xlsx</span>
        </button>

        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-slate-200">
          <BookOpen size={18} />
          <span>開発Wiki</span>
        </button>
      </div>
    </aside>
  );
}

export default FavoriteSidebar;
