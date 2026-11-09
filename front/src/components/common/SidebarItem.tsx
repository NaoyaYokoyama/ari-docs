import type { LucideIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

type Props = {
  label: string;
  icon?: LucideIcon;
  selected?: boolean;
  onClick: () => void;
};

export function SidebarItem({
  label,
  icon: Icon,
  selected = false,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      // Vim モードでサイドバーの行として j・k で動く（FN0702）
      data-vim-item
      className={twMerge(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
        selected
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {Icon && <Icon size={16} className="shrink-0" />}
      {label}
    </button>
  );
}

export default SidebarItem;
