import MDEditor from "@uiw/react-md-editor";
import { useEffect, useState } from "react";
import remarkBreaks from "remark-breaks";

import { downloadNode } from "@/api/node";
import { useTheme } from "@/app/theme";
import Spinner from "@/components/common/Spinner";
import { extensionOf } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";
import { MAX_PREVIEW_BYTES, PREVIEW_FORMATS, type PreviewKind } from "@/lib/previewFormats";
import type { Node } from "@/types/node";

const MAX_CSV_ROWS = 500;

type Kind = PreviewKind | "none";

export function previewKind(name: string): Kind {
  const extension = extensionOf(name);
  return PREVIEW_FORMATS.find((format) => format.extensions.includes(extension))?.kind ?? "none";
}

// UTF-8 として読めなければ Shift_JIS（日本の Windows で多い）として読む
async function readText(blob: Blob) {
  const bytes = await blob.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

// CSV・TSV を表にする（"..." で囲んだ値と、その中の改行・区切りに対応する）
function parseCsv(text: string, separator: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        value += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === separator) {
      row.push(value);
      value = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (rows.length >= MAX_CSV_ROWS) {
        return rows;
      }
    } else {
      value += c;
    }
  }
  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

type Props = {
  node: Node;
  // 右のプレビューの領域（FN0301-BR31）。高さいっぱいに出す。false ならダイアログ（画面の高さの 7 割まで）
  fill?: boolean;
};

// ファイルの中身の表示（FN0301-BR30）。画像・PDF・テキスト・Markdown・CSV。プレビューのダイアログと右の領域で使う
export default function FilePreview({ node, fill = false }: Props) {
  const { resolved } = useTheme();
  const [url, setUrl] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const kind = previewKind(node.name);
  const tooLarge = node.size > MAX_PREVIEW_BYTES;
  const box = fill ? "h-full" : "max-h-[70vh]";

  useEffect(() => {
    setUrl("");
    setText(null);
    setError("");
    setLoading(false);
    if (kind === "none" || tooLarge) {
      return;
    }
    let objectUrl = "";
    let cancelled = false;
    setLoading(true);
    // 右の領域では j・k などで次々に選ぶので、少し止まってから読み込む（通り過ぎたファイルは読まない）
    const timer = window.setTimeout(
      () => {
        downloadNode(node.path)
          .then(async (blob) => {
            if (cancelled) {
              return;
            }
            if (kind === "image" || kind === "pdf") {
              const typed = new Blob([blob], {
                type: kind === "pdf" ? "application/pdf" : extensionOf(node.name) === "svg" ? "image/svg+xml" : blob.type,
              });
              objectUrl = URL.createObjectURL(typed);
              setUrl(objectUrl);
            } else {
              const decoded = await readText(blob);
              if (!cancelled) {
                setText(decoded);
              }
            }
          })
          .catch((e) => !cancelled && setError(errorMessage(e, "読み込めませんでした")))
          .finally(() => !cancelled && setLoading(false));
      },
      fill ? 150 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
    // 同じファイルでも更新されたら読み直す
  }, [node.path, node.updatedAt, node.size, kind, tooLarge, fill]);

  const body = () => {
    if (kind === "none") {
      return (
        <p className="text-sm text-muted-foreground">
          この種類のファイルはプレビューできません。「開く」で PC のアプリで開いてください。
        </p>
      );
    }
    if (tooLarge) {
      return <p className="text-sm text-muted-foreground">大きすぎるためプレビューできません（30 MB まで）。</p>;
    }
    if (error) {
      return <p className="text-sm text-destructive">{error}</p>;
    }
    if (loading) {
      return <Spinner />;
    }
    switch (kind) {
      case "image":
        return url ? <img src={url} alt={node.name} className={`mx-auto ${fill ? "max-h-full" : "max-h-[70vh]"} max-w-full object-contain`} /> : null;
      case "pdf":
        return url ? (
          <div className={fill ? "flex h-full flex-col" : undefined}>
            <iframe src={url} title={node.name} className={`${fill ? "min-h-0 flex-1" : "h-[70vh]"} w-full rounded border border-border`} />
            <p className="mt-2 text-xs text-muted-foreground">表示されないときは「開く」で PC のアプリで開いてください。</p>
          </div>
        ) : null;
      case "markdown":
        return (
          <div data-color-mode={resolved} className={`${box} overflow-y-auto`}>
            <MDEditor.Markdown source={text ?? ""} remarkPlugins={[remarkBreaks]} />
          </div>
        );
      case "csv": {
        const rows = parseCsv(text ?? "", extensionOf(node.name) === "tsv" ? "\t" : ",");
        return (
          <div className={`${box} overflow-auto rounded border border-border`}>
            <table className="border-collapse text-xs">
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className={index === 0 ? "bg-muted font-medium" : "border-t border-border"}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="max-w-64 truncate border-r border-border px-2 py-1" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length >= MAX_CSV_ROWS && (
              <p className="p-2 text-xs text-muted-foreground">最初の {MAX_CSV_ROWS} 行だけを表示しています</p>
            )}
          </div>
        );
      }
      default:
        return (
          <pre className={`${box} overflow-auto rounded border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap`}>
            {text}
          </pre>
        );
    }
  };

  return body();
}
