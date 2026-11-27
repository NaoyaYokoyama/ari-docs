import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { type OfficePreview as Preview, previewOffice } from "@/api/node";
import Spinner from "@/components/common/Spinner";
import { errorMessage } from "@/lib/format";
import type { Node } from "@/types/node";

// 列の名前（0 → A、25 → Z、26 → AA）
export function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

const NOTE = "文字と値だけを表示しています（色・罫線・図・画像は出ません）。元の見た目は「開く」で PC のアプリで開いてください。";

function Sheets({ preview, fill }: { preview: Extract<Preview, { type: "sheets" }>; fill: boolean }) {
  const [index, setIndex] = useState(0);
  const sheet = preview.sheets[Math.min(index, preview.sheets.length - 1)];
  if (!sheet) {
    return <p className="text-sm text-muted-foreground">シートがありません。</p>;
  }
  const columns = Math.max(0, ...sheet.rows.map((row) => row.length));
  return (
    <div className={twMerge("flex flex-col gap-2", fill && "h-full")}>
      {preview.sheets.length > 1 && (
        <div role="tablist" aria-label="シート" className="flex shrink-0 gap-1 overflow-x-auto">
          {preview.sheets.map((item, i) => (
            <button
              key={`${i}-${item.name}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={twMerge(
                "shrink-0 rounded-md border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                i === index ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-accent",
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      <div className={twMerge("overflow-auto rounded border border-border", fill ? "min-h-0 flex-1" : "max-h-[65vh]")}>
        {sheet.rows.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">このシートには値がありません。</p>
        ) : (
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="sticky left-0 z-10 border-r border-b border-border bg-muted px-2 py-1" />
                {Array.from({ length: columns }, (_, c) => (
                  <th key={c} className="border-r border-b border-border px-2 py-1 font-normal text-muted-foreground">
                    {columnName(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r}>
                  <th className="sticky left-0 border-r border-b border-border bg-muted px-2 py-1 text-right font-normal text-muted-foreground">
                    {r + 1}
                  </th>
                  {Array.from({ length: columns }, (_, c) => (
                    <td key={c} className="max-w-64 truncate border-r border-b border-border px-2 py-1" title={row[c] ?? ""}>
                      {row[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        {sheet.truncated && "大きいため、先頭の 500 行・50 列だけを表示しています。"}
        {preview.moreSheets && "シートが多いため、先頭の 30 シートだけを表示しています。"}
        {NOTE}
      </p>
    </div>
  );
}

function Texts({ blocks, slides, truncated, fill }: { blocks: string[]; slides: boolean; truncated: boolean; fill: boolean }) {
  return (
    <div className={twMerge("flex flex-col gap-2", fill && "h-full")}>
      <div className={twMerge("space-y-3 overflow-auto", fill ? "min-h-0 flex-1" : "max-h-[65vh]")}>
        {blocks.map((text, index) => (
          <section key={index} className="rounded border border-border p-3">
            {slides && <p className="mb-1.5 text-xs font-medium text-muted-foreground">スライド {index + 1}</p>}
            {text ? (
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{text}</p>
            ) : (
              <p className="text-sm text-muted-foreground">（文字がありません）</p>
            )}
          </section>
        ))}
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        {truncated && "長いため、先頭だけを表示しています。"}
        {NOTE}
      </p>
    </div>
  );
}

// Office のファイル（Excel・Word・PowerPoint）のプレビュー（FN0301-BR41）。サーバーが取り出した文字とセルの値を出す
export default function OfficePreview({ node, fill }: { node: Node; fill: boolean }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPreview(null);
    setError("");
    let cancelled = false;
    // 右の領域では j・k などで次々に選ぶので、少し止まってから読み込む（通り過ぎたファイルは読まない）
    const timer = window.setTimeout(
      () => {
        previewOffice(node.path)
          .then((result) => !cancelled && setPreview(result))
          .catch((e) => !cancelled && setError(errorMessage(e, "読み込めませんでした")));
      },
      fill ? 150 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // 同じファイルでも更新されたら読み直す
  }, [node.path, node.updatedAt, node.size, fill]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!preview) {
    return <Spinner />;
  }
  if (preview.type === "sheets") {
    return <Sheets key={node.path} preview={preview} fill={fill} />;
  }
  if (preview.type === "slides") {
    return <Texts blocks={preview.slides} slides truncated={preview.truncated} fill={fill} />;
  }
  return <Texts blocks={[preview.text]} slides={false} truncated={preview.truncated} fill={fill} />;
}
