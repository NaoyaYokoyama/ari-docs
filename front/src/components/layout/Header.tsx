import Button from "@/components/common/Button";
import { BookOpen, FileText, Folder, Home, Settings, LogOut } from "lucide-react";
import { Link } from "react-router-dom";

const menus = [
  { id: "home", icon: Home, label: "ホーム", path: "" },
  { id: "folder", icon: Folder, label: "フォルダ", path: "/folder" },
  { id: "memo", icon: FileText, label: "個人メモ", path: "" },
  { id: "wiki", icon: BookOpen, label: "Wiki", path: "" },
  { id: "settings", icon: Settings, label: "設定", path: "" },
];

type Props = {
  displayName: string;
  onLogout: () => void;
};
export default function Header({
  displayName,
  onLogout,
}: Props) {
  return (
    <header className="flex items-center bg-slate-800 p-4 text-white">
      <div className="font-semibold">
        ari-docs
      </div>

      <nav className="ml-16 flex items-center gap-8">
        {menus.map((menu) => {
          const Icon = menu.icon;

          return (
            <Link to={menu.path} key={menu.id}>
              <span className="flex items-center gap-2">
                <Icon size={18} />
                <span className="hidden lg:inline">{menu.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-4">
        <span className="text-sm">
          {displayName}
        </span>

        <Button onClick={onLogout}>
          <span className="flex items-center gap-2">
            <LogOut size={16} />
            <span className="hidden lg:inline">ログアウト</span>
          </span>
        </Button>
      </div>
    </header>
  );
}
