import {
  Home,
  Folder,
  FileText,
  BookOpen,
  Settings,
} from "lucide-react";

import { Link } from "react-router-dom";

const menus = [
  { id: "dashboard", icon: Home, label: "Dashboard", path: ""},
  { id: "folder", icon: Folder, label: "フォルダ", path: "/folder"},
  { id: "memo", icon: FileText, label: "個人メモ", path: ""},
  { id: "wiki", icon: BookOpen, label: "Wiki", path: ""},
  { id: "settings", icon: Settings, label: "設定", path: ""},
];
const menuClass =
  "flex items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-200 transition-colors cursor-pointer";

function Sidebar() {
  return (
    <aside className="w-64 bg-slate-100 p-4">

    <nav className="space-y-2">
    {menus.map((menu) => {
      const Icon = menu.icon;
      return (
        <Link to={menu.path} key={menu.id} className={menuClass}>
          <Icon size={18} />
          <span>{menu.label}</span>
        </Link>
      )
    })}
    </nav>

    </aside>
  );
}

export default Sidebar;
