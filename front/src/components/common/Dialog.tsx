import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

function Dialog({
  open,
  title,
  onClose,
  children,
}: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    }
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
    className="fixed inset-0 flex items-center justify-center bg-black/30"
    onClick={onClose}
    >
    <div
    className="w-96 rounded-lg bg-white p-6 shadow-lg"
    onClick={(e) => e.stopPropagation()}
    >
    <h2 className="mb-6 text-xl font-semibold">
     {title}
    </h2>
    {children}
    </div>
    </div>
  );
}

export default Dialog;
