import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

// 設定の各項目の見出しと説明。中身は枠で囲む（plain なら囲まず、SettingCard を並べる）
export function SettingPanel({
  title,
  description,
  plain = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  plain?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {plain ? (
        <div className="mt-6 space-y-6">{children}</div>
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">{children}</div>
      )}
    </section>
  );
}

// 項目のまとまり（枠）。見出しは任意
export function SettingCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      {title && <h2 className="mb-1 text-sm font-semibold">{title}</h2>}
      {description && <p className="mb-2 text-xs text-muted-foreground">{description}</p>}
      <div className={twMerge("rounded-xl border border-border bg-card p-5", title && "mt-2")}>
        {children}
      </div>
    </div>
  );
}

// 1 行の設定（左に名前と説明、右に切り替え）。SettingCard の中に並べる
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-60">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

// オン・オフの切り替え
export function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  // 画面の読み上げ用（見た目の名前は SettingRow の label）
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={twMerge(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-brand" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={twMerge(
          // つまみはダークでも見えるよう白にする
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5.5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// いくつかの中から 1 つを選ぶ（横に並べたボタン）
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-wrap rounded-lg border border-border bg-background p-0.5"
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={twMerge(
              "rounded-md px-3 py-1 text-sm transition-colors",
              checked
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// 初めの値と違うときに出す「既定に戻す」
export function ResetButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      既定に戻す
    </button>
  );
}
