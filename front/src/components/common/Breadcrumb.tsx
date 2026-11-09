import { ChevronRight, HardDrive } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

type Props = {
  path: string;
  onNavigate: (path: string) => void;
  // 先頭（ルート）の表示名
  rootLabel?: string;
  // ドラッグしたものをドロップできるか・ドロップしたとき（target はその階層のパス）。無ければドロップできない
  canDrop?: (target: string, event: React.DragEvent) => boolean;
  onDrop?: (target: string, event: React.DragEvent) => void;
};

function Breadcrumb({ path, onNavigate, rootLabel = "folder", canDrop, onDrop }: Props) {
  const items = path.split("/").filter(Boolean);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // パンくずの各階層をドロップ先にする（一つ上のフォルダへ移すときなど）
  const dropProps = (target: string) =>
    onDrop
      ? {
          onDragOver: (event: React.DragEvent) => {
            if (canDrop && !canDrop(target, event)) {
              return;
            }
            event.preventDefault();
            setDropTarget(target);
          },
          onDragLeave: () => setDropTarget(null),
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            setDropTarget(null);
            onDrop(target, event);
          },
        }
      : {};
  const dropClass = (target: string) =>
    dropTarget === target ? "bg-brand/10 text-brand outline-2 outline-brand" : "";

  return (
    <nav aria-label="現在の場所" className="flex min-w-0 items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate("")}
        {...dropProps("")}
        className={twMerge(
          "flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground",
          dropClass(""),
        )}
      >
        <HardDrive size={15} />
        {rootLabel}
      </button>

      {items.map((item, index) => {
        const target = items.slice(0, index + 1).join("/");
        const last = index === items.length - 1;

        return (
          <div key={target} className="flex min-w-0 items-center gap-1">
            <ChevronRight size={14} className="shrink-0 text-muted-foreground" />

            <button
              type="button"
              onClick={() => onNavigate(target)}
              aria-current={last ? "page" : undefined}
              {...dropProps(target)}
              className={twMerge(
                "truncate rounded px-1.5 py-1 hover:bg-accent",
                last ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                dropClass(target),
              )}
            >
              {item}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

export default Breadcrumb;
