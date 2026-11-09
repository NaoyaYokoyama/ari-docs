import type { LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

export type ContextMenuItem =
  | {
      label: string;
      icon?: LucideIcon;
      // 右に出すキーの案内（例: F2）
      shortcut?: string;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | "separator";

type Props = {
  // 開く位置（画面の座標）。null なら閉じている
  position: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
};

// 右クリックのメニュー。外側のクリック・Esc・スクロールで閉じる。↑↓ で選び Enter で決める
export default function ContextMenu({ position, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState(position);

  // 画面からはみ出す場合は、内側に寄せる
  useLayoutEffect(() => {
    if (!position || !ref.current) {
      setPlace(position);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    setPlace({
      x: Math.max(4, Math.min(position.x, window.innerWidth - width - 4)),
      y: Math.max(4, Math.min(position.y, window.innerHeight - height - 4)),
    });
  }, [position]);

  useEffect(() => {
    if (!position) {
      return;
    }
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (event: Event) => {
      if (event.target instanceof globalThis.Node && ref.current?.contains(event.target)) {
        return;
      }
      onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [position, onClose]);

  if (!position) {
    return null;
  }

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-52 rounded-lg border border-border bg-card py-1 text-sm text-card-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
      style={{ left: place?.x ?? position.x, top: place?.y ?? position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => {
        if (item === "separator") {
          return <div key={`separator-${index}`} className="my-1 border-t border-border" />;
        }
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={twMerge(
              "flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
              item.danger && "text-destructive",
            )}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {Icon && <Icon size={15} />}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-muted-foreground">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
