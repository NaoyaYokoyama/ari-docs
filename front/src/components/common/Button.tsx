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
import { twMerge } from "tailwind-merge";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary:
          "border border-border bg-background text-foreground hover:bg-accent",
        danger: "bg-destructive text-white hover:bg-destructive/85",
        ghost: "text-foreground hover:bg-accent",
      },

      size: {
        sm: "h-8 px-2.5 text-sm",
        md: "h-9 px-4 text-sm",
        lg: "h-11 px-6",
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

function Button({ variant, size, className, type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={twMerge(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export default Button;
