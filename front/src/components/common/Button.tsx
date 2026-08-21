/**
 * 共通ボタンコンポーネント。
 *
 * @example
 * ```tsx
 * <Button>保存</Button>
 *
 * <Button variant="secondary" size="sm">
 *   キャンセル
 * </Button>
 *
 * <Button
 *   variant="danger"
 *   onClick={handleDelete}
 * >
 *   削除
 * </Button>
 * ```
 */
import { cva } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";


const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 gap-2",
  {
    variants: {
      variant: {
        primary:
          "bg-slate-800 text-white hover:bg-slate-700",
        secondary:
          "border border-slate-300 bg-white hover:bg-slate-50",
        danger:
          "bg-red-600 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300",
        ghost:
          "hover:bg-slate-100",
      },

      size: {
        sm: "px-2 py-1 text-sm",
        md: "px-4 py-2",
        lg: "px-6 py-3",
      },
    },

    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);


type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
};

function Button({
  variant,
  size,
  className,
  ...props
}: Props) {
  return (
    <button
      className={buttonVariants({
        variant,
        size,
      })}
      {...props}
    />
  );
}

export default Button;
