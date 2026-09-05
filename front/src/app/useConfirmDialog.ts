import { useState } from "react";

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [resolveConfirm, setResolveConfirm] =
    useState<((result: boolean) => void) | null>(null);

  const showConfirm = (message: string) => {
    setMessage(message);
    setOpen(true);

    return new Promise<boolean>((resolve) => {
      setResolveConfirm(() => resolve);
    });
  };

  const confirm = () => {
    resolveConfirm?.(true);
    setOpen(false);
    setResolveConfirm(null);
  };

  const cancel = () => {
    resolveConfirm?.(false);
    setOpen(false);
    setResolveConfirm(null);
  };

  return {
    open,
    message,
    showConfirm,
    confirm,
    cancel,
  };
}
