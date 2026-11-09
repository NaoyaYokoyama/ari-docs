import { Check, ChevronDown, ListFilter } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { SEARCH_TYPES, type SearchType } from "@/app/preferences";

type Props = {
  // 空ならすべて
  value: SearchType[];
  onChange: (value: SearchType[]) => void;
};

// 検索で探す種類を選ぶ（複数選べる。既定はすべて。FN0201-BR09）
export default function SearchTypeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const all = value.length === 0;

  // 外を押す・Esc で閉じる
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey, true);
    };
  }, [open]);

  // 「すべて」のときに 1 つ押したら、それだけにする。すべて選んだ・すべて外したときは「すべて」に戻す
  const toggle = (type: SearchType) => {
    const next = all
      ? [type]
      : value.includes(type)
        ? value.filter((selected) => selected !== type)
        : [...value, type];
    onChange(next.length === SEARCH_TYPES.length ? [] : next);
  };

  const selectedLabels = SEARCH_TYPES.filter((type) => value.includes(type.value)).map(
    (type) => type.label,
  );
  const label = all
    ? "すべて"
    : selectedLabels.length <= 2
      ? selectedLabels.join("・")
      : `${selectedLabels.length} 種類`;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        title={all ? "探す種類: すべて" : `探す種類: ${selectedLabels.join("・")}`}
        onClick={() => setOpen((current) => !current)}
        className={twMerge(
          "flex h-12 max-w-48 items-center gap-1.5 rounded-full border border-input bg-background px-4 text-sm shadow-sm transition outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20",
          !all && "border-brand text-brand",
        )}
      >
        <ListFilter size={16} className="shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="group"
          aria-label="探す種類"
          className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border border-border bg-background p-1.5 shadow-lg"
        >
          <Option label="すべて" checked={all} onClick={() => onChange([])} />
          <div className="my-1 border-t border-border" />
          {SEARCH_TYPES.map((type) => (
            <Option
              key={type.value}
              label={type.label}
              description={type.description}
              checked={!all && value.includes(type.value)}
              onClick={() => toggle(type.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  description,
  checked,
  onClick,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
    >
      <span
        className={twMerge(
          "flex size-4 shrink-0 items-center justify-center rounded border border-input",
          checked && "border-brand bg-brand text-brand-foreground",
        )}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {description && (
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </button>
  );
}
