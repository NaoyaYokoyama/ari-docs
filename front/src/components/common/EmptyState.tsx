import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type Props = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  // 「新規作成」などのボタン
  action?: ReactNode;
  className?: string;
};

// 一覧が空のとき・何も選んでいないときの表示
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div
      className={twMerge(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon size={22} />
      </div>
      <p className="font-medium">{title}</p>
      {description && (
        <div className="max-w-sm text-sm text-muted-foreground">
          {description}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
