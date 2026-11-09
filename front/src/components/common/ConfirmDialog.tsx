import { TriangleAlert } from "lucide-react";

import Button from "@/components/common/Button";

type Props = {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in-0">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl animate-in zoom-in-95 fade-in-0"
      >
        <div className="mb-5 flex gap-3">
          <TriangleAlert size={20} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm leading-relaxed">{message}</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            キャンセル
          </Button>

          {/* 開いたらすぐ Enter で決定できるようにする */}
          <Button autoFocus onClick={onConfirm}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
