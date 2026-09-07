import { useEffect, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
} from "lucide-react";

type Props = {
  type: "info" | "error";
  message: string;
  duration?: number;
  onClose: () => void;
};

export default function Toast({
  type,
  message,
  duration = 3000,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      return;
    }

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
        px-7
        py-4
        font-semibold
        text-base
        text-white
        shadow-2xl
        shadow-black/70
        transition-all
        duration-300
        ${
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-4 opacity-0"
        }
      `}
    >
      {type === "error" ? (
        <CircleAlert
          size={22}
          strokeWidth={2}
          className="text-red-400"
        />
      ) : (
        <CircleCheck
          size={22}
          strokeWidth={2}
          className="text-slate-200"
        />
      )}

      <span>{message}</span>
    </div>
  );
}
