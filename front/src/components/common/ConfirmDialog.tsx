type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "OK",
  cancelText = "キャンセル",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">
          {title}
        </h2>

        <p className="mt-3 text-sm text-slate-600">
          {message}
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-md border px-4 py-2"
            onClick={onCancel}
          >
            {cancelText}
          </button>

          <button
            className="rounded-md bg-slate-800 px-4 py-2 text-white"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
