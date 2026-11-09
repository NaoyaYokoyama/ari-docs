import type { ButtonHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

import Hint, { useHintsEnabled } from "@/components/common/Hint";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  // ツールチップ兼、読み上げ用の名前（必須）
  label: string;
  active?: boolean;
  // 一言の説明（Hint）。設定で説明を消しているときは label だけを title で出す
  hint?: string;
};

// アイコンだけのボタン。label はマウスを乗せると表示される（hint があれば一言の説明も）
export default function IconButton({
  label,
  active = false,
  className,
  type = "button",
  hint,
  ...props
}: Props) {
  const hintsEnabled = useHintsEnabled();
  const withHint = !!hint && hintsEnabled;
  const button = (
    <button
      type={type}
      title={withHint ? undefined : label}
      aria-label={label}
      aria-pressed={active || undefined}
      className={twMerge(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
        active && "bg-accent text-foreground",
        className,
      )}
      {...props}
    />
  );
  return withHint ? (
    <Hint title={label} text={hint}>
      {button}
    </Hint>
  ) : (
    button
  );
}
