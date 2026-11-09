import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

type Props = {
  type: "info" | "error";
  message: string;
  // 同じ文言を続けて出したときも表示し直すための番号
  id: number;
  duration?: number;
  onClose: () => void;
};

export default function Toast({
  type,
  message,
  id,
  duration = 3000,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // エラーは読み終わるまで少し長めに出す
  const shown = type === "error" ? duration * 2 : duration;

  useEffect(() => {
    if (!message) {
      return;
    }

    setVisible(true);

    const hideTimer = setTimeout(() => {
      setVisible(false);
    }, shown - 300);

    const closeTimer = setTimeout(() => {
      onCloseRef.current();
    }, shown);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(closeTimer);
    };
  }, [message, id, shown]);

  if (!message) {
    return null;
  }

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      onClick={() => onCloseRef.current()}
      className={twMerge(
        "fixed bottom-6 left-1/2 z-[60] flex max-w-[90vw] -translate-x-1/2 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-popover px-4 py-3 text-sm font-medium text-popover-foreground shadow-lg transition-all duration-300",
        type === "error" && "border-destructive/40",
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
    >
      {type === "error" ? (
        <CircleAlert size={18} className="shrink-0 text-destructive" />
      ) : (
        <CircleCheck size={18} className="shrink-0 text-success" />
      )}

      <span>{message}</span>
    </div>
  );
}
