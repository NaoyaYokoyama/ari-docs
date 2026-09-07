import {
  useEffect,
  useState,
} from "react";

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [resolveConfirm, setResolveConfirm] =
    useState<
      ((result: boolean) => void) | null
    >(null);

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

  // Escでキャンセル
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (
      e: KeyboardEvent,
    ) => {
      if (e.key !== "Escape") {
        return;
      }

      e.preventDefault();
      cancel();
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open, resolveConfirm]);

  return {
    open,
    message,
    showConfirm,
    confirm,
    cancel,
  };
}
