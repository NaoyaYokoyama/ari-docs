import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { twMerge } from "tailwind-merge";

import IconButton from "@/components/common/IconButton";

type Props = {
  open: boolean;
  title: ReactNode;
  // タイトルの下に出す補足
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  // 右下のボタン（キャンセル・決定など）
  footer?: ReactNode;
  className?: string;
};

function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 animate-in fade-in-0"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={twMerge(
          "w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-xl animate-in zoom-in-95 fade-in-0",
          className,
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <IconButton label="閉じる（Esc）" onClick={onClose} className="-mt-1 -mr-1">
            <X size={16} />
          </IconButton>
        </div>
        <div className="px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 rounded-b-xl border-t border-border bg-muted/50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dialog;
