import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "@/components/common/Button";
import { type CharPart, diffChars, sideBySide,type SideRow } from "@/lib/lineDiff";

// 文字の比べる画面（FN0304-BR03）。左右に並べ、変わった行は黄、左にだけある行は赤、右にだけある行は緑にし、
// 変わった行の中の変わった文字に濃い色を付ける。「次の違い」「前の違い」（Alt+↓・Alt+↑）で違うところへ移る
type Props = {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  // ダイアログの中など、高さを親に合わせる
  className?: string;
};

// 違うところだけを出すとき、違いの前後に残す同じ行の数
const CONTEXT = 3;

type Block = { start: number; changed: number; removed: number; added: number };

// 続いた違いを 1 か所とみなす
function blocksOf(rows: SideRow[]): Block[] {
  const blocks: Block[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "same") {
      return;
    }
    let block = blocks[blocks.length - 1];
    if (!block || rows[index - 1]?.kind === "same") {
      block = { start: index, changed: 0, removed: 0, added: 0 };
      blocks.push(block);
    }
    block[row.kind]++;
  });
  return blocks;
}

export default function TextCompare({ left, right, leftLabel, rightLabel, className }: Props) {
  const rows = useMemo(() => sideBySide(left, right), [left, right]);
  const blocks = useMemo(() => blocksOf(rows), [rows]);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [current, setCurrent] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 違うところだけ: 違う行とその前後 CONTEXT 行だけを残す
  const visible = useMemo(() => {
    if (!onlyDiff) {
      return rows.map((_, index) => index);
    }
    const keep = new Set<number>();
    rows.forEach((row, index) => {
      if (row.kind !== "same") {
        for (let near = index - CONTEXT; near <= index + CONTEXT; near++) {
          keep.add(near);
        }
      }
    });
    return rows.map((_, index) => index).filter((index) => keep.has(index));
  }, [rows, onlyDiff]);

  const go = (step: number) => {
    if (blocks.length === 0) {
      return;
    }
    const next = (current + step + blocks.length) % blocks.length;
    setCurrent(next);
    scrollRef.current
      ?.querySelector(`[data-row="${blocks[next].start}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        go(event.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const total = blocks.reduce(
    (sum, block) => ({
      changed: sum.changed + block.changed,
      removed: sum.removed + block.removed,
      added: sum.added + block.added,
    }),
    { changed: 0, removed: 0, added: 0 },
  );

  return (
    <div className={twMerge("flex min-h-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {blocks.length === 0 ? (
          <span className="font-medium text-place-green">同じです（違うところはありません）</span>
        ) : (
          <span>
            違うところが <strong>{blocks.length}</strong> か所あります
            <span className="ml-2 text-xs text-muted-foreground">
              変わった行 {total.changed}・左だけ {total.removed}・右だけ {total.added}
            </span>
          </span>
        )}
        <span className="flex-1" />
        <Legend />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-brand" />
          違うところだけ
        </label>
        <Button size="sm" variant="secondary" disabled={blocks.length === 0} onClick={() => go(-1)} title="前の違い（Alt+↑）">
          <ChevronUp size={15} />
          前の違い
        </Button>
        <Button size="sm" variant="secondary" disabled={blocks.length === 0} onClick={() => go(1)} title="次の違い（Alt+↓）">
          <ChevronDown size={15} />
          次の違い
        </Button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse font-mono text-[0.8125rem] leading-relaxed">
          <colgroup>
            <col className="w-12" />
            <col />
            <col className="w-12" />
            <col />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted text-left font-sans text-xs">
            <tr>
              <th colSpan={2} className="truncate border-b border-border px-2 py-1.5" title={leftLabel}>
                左: {leftLabel}
              </th>
              <th colSpan={2} className="truncate border-b border-l border-border px-2 py-1.5" title={rightLabel}>
                右: {rightLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((index, position) => {
              const gap = position > 0 && visible[position - 1] !== index - 1;
              return [
                gap && (
                  <tr key={`gap-${index}`}>
                    <td colSpan={4} className="bg-muted/50 px-2 py-0.5 text-center font-sans text-xs text-muted-foreground">
                      ⋯ 同じ行を省いています ⋯
                    </td>
                  </tr>
                ),
                <Row
                  key={index}
                  row={rows[index]}
                  index={index}
                  focused={current >= 0 && blocks[current]?.start === index}
                />,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded bg-warning/20 px-1.5">変わった</span>
      <span className="rounded bg-destructive/15 px-1.5">左だけ</span>
      <span className="rounded bg-place-green/20 px-1.5">右だけ</span>
    </span>
  );
}

const NUMBER = "select-none px-2 text-right align-top text-xs text-muted-foreground";
const TEXT = "px-2 align-top break-all whitespace-pre-wrap";

function Row({ row, index, focused }: { row: SideRow; index: number; focused: boolean }) {
  const ring = focused ? "outline-2 -outline-offset-2 outline-brand" : "";
  if (row.kind === "same") {
    return (
      <tr data-row={index}>
        <td className={NUMBER}>{row.leftNo}</td>
        <td className={TEXT}>{row.text || " "}</td>
        <td className={twMerge(NUMBER, "border-l border-border")}>{row.rightNo}</td>
        <td className={TEXT}>{row.text || " "}</td>
      </tr>
    );
  }
  if (row.kind === "changed") {
    const parts = diffChars(row.left, row.right);
    return (
      <tr data-row={index} className={twMerge("bg-warning/15", ring)}>
        <td className={NUMBER}>{row.leftNo}</td>
        <td className={TEXT}>
          <Parts parts={parts.left} mark="bg-destructive/25" />
        </td>
        <td className={twMerge(NUMBER, "border-l border-border")}>{row.rightNo}</td>
        <td className={TEXT}>
          <Parts parts={parts.right} mark="bg-place-green/35" />
        </td>
      </tr>
    );
  }
  if (row.kind === "removed") {
    return (
      <tr data-row={index} className={ring}>
        <td className={twMerge(NUMBER, "bg-destructive/10")}>{row.leftNo}</td>
        <td className={twMerge(TEXT, "bg-destructive/10")}>{row.left || " "}</td>
        <td className="border-l border-border bg-muted/40" />
        <td className="bg-muted/40" />
      </tr>
    );
  }
  return (
    <tr data-row={index} className={ring}>
      <td className="bg-muted/40" />
      <td className="bg-muted/40" />
      <td className={twMerge(NUMBER, "border-l border-border bg-place-green/15")}>{row.rightNo}</td>
      <td className={twMerge(TEXT, "bg-place-green/15")}>{row.right || " "}</td>
    </tr>
  );
}

function Parts({ parts, mark }: { parts: CharPart[]; mark: string }) {
  if (parts.length === 0) {
    return " ";
  }
  return parts.map((part, index) =>
    part.changed ? (
      <mark key={index} className={twMerge("rounded-sm text-foreground", mark)}>
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}
