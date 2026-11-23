import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "@/components/common/Button";
import type { FormulaChange, RowCompare, SheetCompare as Sheet } from "@/types/compare";

// Excel の比べる画面（FN0304-BR02）。シートを切り替えて、1 つの表に右（新しい方）の値を出す。
// 変わったセルは黄にし、前の値を消し線で添える。左にだけある行は赤の消し線、右にだけある行は緑。
// 行番号は左・右それぞれのシートの行番号（行を足し引きしてもずれて見えないように）。
// 数式が変わったセル（FN0304-BR07）は紫にし、ƒ の印を付けて、左右の数式を添える
type Props = {
  sheets: Sheet[];
  leftLabel: string;
  rightLabel: string;
};

const STATUS_LABEL: Record<Sheet["status"], string> = {
  same: "同じ",
  changed: "違う",
  onlyLeft: "左だけ",
  onlyRight: "右だけ",
};

const STATUS_CLASS: Record<Sheet["status"], string> = {
  same: "bg-muted text-muted-foreground",
  changed: "bg-warning/25",
  onlyLeft: "bg-destructive/15",
  onlyRight: "bg-place-green/20",
};

// 列の見出し（A, B, …, Z, AA, …）
function columnName(index: number) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export default function SheetCompare({ sheets, leftLabel, rightLabel }: Props) {
  // 最初は違いのあるシートを開く
  const [selected, setSelected] = useState(() => Math.max(0, sheets.findIndex((sheet) => sheet.status !== "same")));
  const sheet = sheets[selected];
  const different = sheets.filter((item) => item.status !== "same").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-sm">
        {different === 0 ? (
          <span className="font-medium text-place-green">すべてのシートが同じです</span>
        ) : (
          <>
            {sheets.length} シートのうち <strong>{different}</strong> シートに違いがあります
          </>
        )}
        <span className="ml-3 text-xs text-muted-foreground">
          左: {leftLabel} ／ 右: {rightLabel}（表には右の値を出し、変わったセルに左の値を添えます）
        </span>
      </p>
      <div role="tablist" aria-label="シート" className="flex flex-wrap gap-1">
        {sheets.map((item, index) => (
          <button
            key={`${item.name}-${index}`}
            type="button"
            role="tab"
            aria-selected={index === selected}
            onClick={() => setSelected(index)}
            className={twMerge(
              "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent",
              index === selected && "border-brand bg-accent font-medium",
            )}
          >
            {item.name}
            <span className={twMerge("rounded px-1.5 text-[0.6875rem]", STATUS_CLASS[item.status])}>
              {STATUS_LABEL[item.status]}
            </span>
          </button>
        ))}
      </div>
      {sheet && <SheetGrid key={selected} sheet={sheet} />}
    </div>
  );
}

function SheetGrid({ sheet }: { sheet: Sheet }) {
  const [onlyDiff, setOnlyDiff] = useState(sheet.rows.length > 200);
  const [current, setCurrent] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const diffRows = useMemo(
    () => sheet.rows.map((row, index) => (row.kind === "same" ? -1 : index)).filter((index) => index >= 0),
    [sheet],
  );
  const rows = onlyDiff ? diffRows : sheet.rows.map((_, index) => index);
  const columns = Array.from({ length: Math.max(1, sheet.columns) }, (_, index) => index);

  const go = (step: number) => {
    if (diffRows.length === 0) {
      return;
    }
    const next = (current + step + diffRows.length) % diffRows.length;
    setCurrent(next);
    scrollRef.current
      ?.querySelector(`[data-row="${diffRows[next]}"]`)
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

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span>
          違う行: <strong>{diffRows.length}</strong>
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="rounded bg-warning/25 px-1.5">変わったセル</span>
          <span className="rounded bg-place-violet/20 px-1.5">数式が変わったセル</span>
          <span className="rounded bg-destructive/15 px-1.5">左だけの行</span>
          <span className="rounded bg-place-green/20 px-1.5">右だけの行</span>
        </span>
        {sheet.truncated && (
          <span className="text-warning">大きいシートなので、3000 行・100 列までを比べています</span>
        )}
        <span className="flex-1" />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-brand" />
          違う行だけ
        </label>
        <Button size="sm" variant="secondary" disabled={diffRows.length === 0} onClick={() => go(-1)} title="前の違い（Alt+↑）">
          <ChevronUp size={15} />
          前の違い
        </Button>
        <Button size="sm" variant="secondary" disabled={diffRows.length === 0} onClick={() => go(1)} title="次の違い（Alt+↓）">
          <ChevronDown size={15} />
          次の違い
        </Button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
        {sheet.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">このシートは空です</p>
        ) : (
          <table className="border-collapse text-[0.8125rem]">
            <thead className="sticky top-0 z-10 bg-muted text-xs">
              <tr>
                <th className="sticky left-0 z-20 border border-border bg-muted px-1.5 py-1" title="左のシートの行番号">
                  左
                </th>
                <th className="sticky left-10 z-20 border border-border bg-muted px-1.5 py-1" title="右のシートの行番号">
                  右
                </th>
                {columns.map((column) => (
                  <th key={column} className="min-w-20 border border-border px-2 py-1 font-medium">
                    {columnName(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((index) => (
                <GridRow
                  key={index}
                  index={index}
                  row={sheet.rows[index]}
                  columns={columns}
                  focused={current >= 0 && diffRows[current] === index}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function GridRow({ row, index, columns, focused }: { row: RowCompare; index: number; columns: number[]; focused: boolean }) {
  const changed = new Set(row.changed);
  const formulas = new Map((row.formulas ?? []).map((formula) => [formula.column, formula]));
  const values = row.right ?? row.left ?? [];
  const rowClass =
    row.kind === "removed" ? "bg-destructive/10 text-muted-foreground line-through" : row.kind === "added" ? "bg-place-green/15" : "";
  return (
    <tr data-row={index} className={twMerge(rowClass, focused && "outline-2 -outline-offset-2 outline-brand")}>
      <td className="sticky left-0 w-10 border border-border bg-muted px-1.5 text-right text-xs text-muted-foreground">
        {row.leftRow ?? ""}
      </td>
      <td className="sticky left-10 w-10 border border-border bg-muted px-1.5 text-right text-xs text-muted-foreground">
        {row.rightRow ?? ""}
      </td>
      {columns.map((column) => {
        const value = values[column] ?? "";
        const formula = formulas.get(column);
        if (row.kind === "changed" && changed.has(column)) {
          const before = row.left?.[column] ?? "";
          return (
            <td
              key={column}
              className="max-w-72 border border-border bg-warning/25 px-2 py-0.5 align-top"
              title={`左: ${before}\n右: ${value}${formula ? formulaTitle(formula) : ""}`}
            >
              {before && <span className="block text-xs text-destructive line-through">{before}</span>}
              <span className="block">
                {value || <span className="text-xs text-muted-foreground">（空）</span>}
                {formula && <FormulaMark />}
              </span>
              {formula && <FormulaLines formula={formula} />}
            </td>
          );
        }
        if (formula) {
          return (
            <td
              key={column}
              className="max-w-72 border border-border bg-place-violet/20 px-2 py-0.5 align-top"
              title={`値: ${value}${formulaTitle(formula)}`}
            >
              <span className="block">
                {value}
                <FormulaMark />
              </span>
              <FormulaLines formula={formula} />
            </td>
          );
        }
        return (
          <td key={column} className="max-w-72 truncate border border-border px-2 py-0.5 align-top" title={value}>
            {value}
          </td>
        );
      })}
    </tr>
  );
}

function formulaTitle(formula: FormulaChange) {
  return `\n左の数式: ${formula.left || "（なし）"}\n右の数式: ${formula.right || "（なし）"}`;
}

function FormulaMark() {
  return (
    <span className="ml-1 rounded bg-place-violet/30 px-1 text-[0.6875rem] italic" aria-label="数式が変わった">
      ƒ
    </span>
  );
}

// 数式の違い（左は消し線、右はそのまま）
function FormulaLines({ formula }: { formula: FormulaChange }) {
  return (
    <span className="mt-0.5 block font-mono text-[0.6875rem] break-all">
      <span className="block text-destructive line-through">{formula.left || "（数式なし）"}</span>
      <span className="block">{formula.right || "（数式なし）"}</span>
    </span>
  );
}
