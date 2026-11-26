import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { dateAfter } from "@/pages/task/taskView";

// 更新日の期間（FN0201-BR11）。from・to は YYYY-MM-DD（両端を含む。空なら区切らない）
export type SearchPeriod = {
  preset: PeriodPreset;
  from: string;
  to: string;
};

type PeriodPreset = "" | "today" | "week" | "month" | "year" | "custom";

export const NO_PERIOD: SearchPeriod = { preset: "", from: "", to: "" };

// 今日を含めて何日分か
const PRESETS: { value: Exclude<PeriodPreset, "" | "custom">; label: string; days: number }[] = [
  { value: "today", label: "今日", days: 1 },
  { value: "week", label: "1 週間以内", days: 7 },
  { value: "month", label: "1 か月以内", days: 31 },
  { value: "year", label: "1 年以内", days: 365 },
];

// 決まった期間は探すときの今日から数える（日をまたいで開いたままでもずれない）
export function periodRange(period: SearchPeriod) {
  const preset = PRESETS.find((item) => item.value === period.preset);
  if (preset) {
    return { from: dateAfter(1 - preset.days), to: "" };
  }
  return { from: period.from, to: period.to };
}

// 今年なら年を省く
function shortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return year === new Date().getFullYear() ? `${month}/${day}` : `${year}/${month}/${day}`;
}

export function periodLabel(period: SearchPeriod) {
  const preset = PRESETS.find((item) => item.value === period.preset);
  if (preset) {
    return preset.label;
  }
  if (period.preset === "custom") {
    return `${period.from ? shortDate(period.from) : ""}〜${period.to ? shortDate(period.to) : ""}`;
  }
  return "期間";
}

type Props = {
  value: SearchPeriod;
  onChange: (value: SearchPeriod) => void;
};

// 検索で更新日の期間を選ぶ（FN0201-BR11）。この PC に覚えない（次に開いたときは指定なし）
export default function SearchPeriodFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value.preset === "custom" ? value.from : "");
  const [to, setTo] = useState(value.preset === "custom" ? value.to : "");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const active = value.preset !== "";

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

  const choose = (period: SearchPeriod) => {
    onChange(period);
    setOpen(false);
  };
  const reversed = from !== "" && to !== "" && from > to;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        title={active ? `更新日: ${periodLabel(value)}` : "更新日の期間で絞る"}
        onClick={() => setOpen((current) => !current)}
        className={twMerge(
          "flex h-12 max-w-44 items-center gap-1.5 rounded-full border border-input bg-background px-4 text-sm shadow-sm transition outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20",
          active && "border-brand text-brand",
        )}
      >
        <CalendarRange size={16} className="shrink-0" />
        <span className="truncate">{periodLabel(value)}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="group"
          aria-label="更新日の期間"
          className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border border-border bg-background p-1.5 shadow-lg"
        >
          <p className="px-2.5 pt-1 pb-1.5 text-xs text-muted-foreground">
            この期間に更新したものだけを出します。検索語が空でも探せます
          </p>
          {[{ value: "" as const, label: "指定なし" }, ...PRESETS].map((preset) => (
            <button
              key={preset.value}
              type="button"
              role="menuitemradio"
              aria-checked={value.preset === preset.value}
              onClick={() => choose({ preset: preset.value, from: "", to: "" })}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-brand">
                {value.preset === preset.value && <Check size={14} strokeWidth={3} />}
              </span>
              {preset.label}
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <form
            className="space-y-2 px-2.5 py-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if ((from || to) && !reversed) {
                choose({ preset: "custom", from, to });
              }
            }}
          >
            <p className="flex items-center gap-2.5 text-sm">
              <span className="flex size-4 shrink-0 items-center justify-center text-brand">
                {value.preset === "custom" && <Check size={14} strokeWidth={3} />}
              </span>
              期間を指定
            </p>
            <div className="flex items-center gap-1.5 text-sm">
              <Input
                type="date"
                aria-label="いつから"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="min-w-0 flex-1 px-2"
              />
              〜
              <Input
                type="date"
                aria-label="いつまで"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="min-w-0 flex-1 px-2"
              />
            </div>
            {reversed && <p className="text-xs text-destructive">始めの日を終わりの日より前にしてください</p>}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={(!from && !to) || reversed}>
                この期間で探す
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
