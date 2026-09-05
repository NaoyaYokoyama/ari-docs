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
    <div
      className="
        fixed inset-0 z-50
        flex items-center justify-center
        bg-black/30
      "
    >
      <div
        className="
          w-100
          rounded-lg
          bg-white
          p-6
          shadow-xl
        "
      >
        <p className="mb-6 text-sm text-slate-700">
          {message}
        </p>

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onCancel}
          >
            キャンセル
          </Button>

          <Button onClick={onConfirm}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
