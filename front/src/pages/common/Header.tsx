import Button from "@/components/common/Button";
import {
  BookOpen,
  FileText,
  Folder,
  Home,
  Settings,
  LogOut,
} from "lucide-react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useApp } from "@/app/AppContext";

const menus = [
  {
    id: "home",
    icon: Home,
    label: "Home",
    path: "/",
  },
  {
    id: "folder",
    icon: Folder,
    label: "Folder",
    path: "/folder",
  },
  {
    id: "memo",
    icon: FileText,
    label: "Note",
    path: "/note",
  },
  {
    id: "wiki",
    icon: BookOpen,
    label: "Wiki",
    path: "/wiki",
  },
  {
    id: "settings",
    icon: Settings,
    label: "設定",
    path: "/setting",
  },
];

type Props = {
  displayName: string;
  onLogout: () => void;
};

export default function Header({
  displayName,
  onLogout,
}: Props) {
  const {
    user,
    isDirty,
    setIsDirty,
    showConfirm,
  } = useApp();

  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigate = async (path: string) => {
    if (location.pathname === path) {
      return;
    }

    if (isDirty) {
      const confirmed = await showConfirm(
        "未保存の変更があります。破棄して移動しますか？",
      );

      if (!confirmed) {
        return;
      }

      setIsDirty(false);
    }

    navigate(path);
  };

  return (
    <header className="flex items-center bg-slate-800 px-3 py-1 text-white">
      {/* TODO icon */}
      <div className="font-semibold">
        <div className="text-xl"></div>
      </div>

      <nav className="ml-16 flex items-center gap-8">
        {menus.map((menu) => {
          const Icon = menu.icon;

          return (
            <Button
              key={menu.id}
              onClick={() => handleNavigate(menu.path)}
              className={
                location.pathname === menu.path
                  ? "border-b-3 border-white"
                  : "border-b-3 border-transparent"
              }
            >
              <span className="flex items-center gap-2">
                <Icon size={18} />

                <span className="hidden lg:inline">
                  {menu.label}
                </span>
              </span>
            </Button>
          );
        })}
      </nav>

      {user && user.mode !== "local" && (
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm">
            {displayName}
          </span>

          <Button onClick={onLogout}>
            <span className="flex items-center gap-2">
              <LogOut size={16} />

              <span className="hidden lg:inline">
                ログアウト
              </span>
            </span>
          </Button>
        </div>
      )}
    </header>
  );
}
