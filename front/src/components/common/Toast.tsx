import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";

type Props = {
  message: string;
  duration?: number;
  onClose: () => void;
};

export default function Toast({
  message,
  duration = 3000,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;

    setVisible(true);

    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, duration - 300);

    const closeTimer = setTimeout(() => {
      onClose();
    }, duration);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(closeTimer);
    };
  }, [message, duration, onClose]);

  if (!message) {
    return null;
  }

  return (
    <div
      className={`
        fixed
        top-20
        left-1/2
        -translate-x-1/2
        z-50
        flex
        items-center
        gap-2
        rounded-md
        bg-slate-800
        shadow-2xl
        shadow-black/70
        px-7
        py-4
        text-md
        text-white
        text-lg
        shadow-lg
        transition-all
        duration-300
        font-semibold
        ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-4 opacity-0"
        }
      `}
    >
      <CircleCheck
        size={22}
        className="
          text-slate-200
          strokeWidth={2.5}
        "
      />
      <span>{message}</span>
    </div>
  );
}
