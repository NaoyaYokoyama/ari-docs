import {
  BookOpen,
  BookText,
  CircleHelp,
  FileText,
  Folder,
  Home,
  LibraryBig,
  LogOut,
  type LucideIcon,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useContext } from "react";
import { useLocation } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import { useApp } from "@/app/AppContext";
import { type ThemePreference, useTheme } from "@/app/theme";
import { useGuardedNavigate } from "@/app/useGuardedNavigate";
import IconButton from "@/components/common/IconButton";
import Kbd from "@/components/common/Kbd";
import { type NavigationPage, SHORTCUT, shortcutLabel } from "@/shortcut/shortcut";
import { ShortcutContext } from "@/shortcut/ShortcutProvider";
import { useNavigation } from "@/shortcut/useNavigation";

const ICONS: Record<NavigationPage, LucideIcon> = {
  home: Home,
  folder: Folder,
  note: FileText,
  wiki: BookOpen,
  docs: BookText,
  setting: Settings,
};

const THEMES: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "ライト" },
  { value: "dark", icon: Moon, label: "ダーク" },
  { value: "system", icon: Monitor, label: "OS に合わせる" },
];

type Props = {
  displayName: string;
  onLogout: () => void;
};

export default function Header({
  displayName,
  onLogout,
}: Props) {
  const { user } = useApp();
  const shortcut = useContext(ShortcutContext);
  const { preference, setPreference } = useTheme();
  const location = useLocation();
  const navigate = useGuardedNavigate();
  const menus = useNavigation();

  // ライト → ダーク → OS に合わせる、の順に切り替える
  const themeIndex = THEMES.findIndex((theme) => theme.value === preference);
  const nextTheme = THEMES[(themeIndex + 1) % THEMES.length];
  const ThemeIcon = THEMES[themeIndex].icon;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <button
        type="button"
        onClick={() => void navigate("/")}
        className="mr-4 flex items-center gap-2 rounded-md px-1.5 py-1 font-semibold tracking-tight"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <LibraryBig size={16} />
        </span>
        <span className="hidden sm:inline">ari-docs</span>
      </button>

      <nav className="flex h-full items-center gap-1">
        {menus.map((menu) => {
          const Icon = ICONS[menu.page];
          const active = location.pathname === menu.path;

          return (
            <button
              key={menu.page}
              type="button"
              onClick={() => void navigate(menu.path)}
              title={`${menu.label}（${shortcutLabel(menu.shortcut)}）`}
              aria-current={active ? "page" : undefined}
              className={twMerge(
                "relative flex h-full items-center gap-2 px-3 text-sm transition-colors",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={17} />
              <span className="hidden lg:inline">{menu.label}</span>
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {/* 探して開く（FN0003） */}
        <button
          type="button"
          onClick={() => shortcut?.openQuickOpen()}
          title={`探して開く（${shortcutLabel(SHORTCUT.QUICK_OPEN)}）`}
          className="mr-1 flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Search size={15} />
          <span className="hidden md:inline">探して開く</span>
          <span className="hidden md:inline-flex">
            <Kbd>{shortcutLabel(SHORTCUT.QUICK_OPEN)}</Kbd>
          </span>
        </button>

        <IconButton
          label={`配色: ${THEMES[themeIndex].label}（クリックで「${nextTheme.label}」）`}
          onClick={() => setPreference(nextTheme.value)}
        >
          <ThemeIcon size={17} />
        </IconButton>

        <IconButton
          label="キーボードショートカット（?）"
          onClick={() => shortcut?.openHelp()}
        >
          <CircleHelp size={17} />
        </IconButton>

        {user && user.mode !== "local" && (
          <>
            <span className="ml-2 text-sm text-muted-foreground">
              {displayName}
            </span>
            <IconButton label="ログアウト" onClick={onLogout}>
              <LogOut size={17} />
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
