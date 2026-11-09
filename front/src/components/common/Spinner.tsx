import { LoaderCircle } from "lucide-react";
import { twMerge } from "tailwind-merge";

type Props = {
  label?: string;
  className?: string;
};

// 読み込み中の表示
export default function Spinner({ label = "読み込み中...", className }: Props) {
  return (
    <div
      role="status"
      className={twMerge(
        "flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground",
        className,
      )}
    >
      <LoaderCircle size={16} className="animate-spin" />
      {label}
    </div>
  );
}
