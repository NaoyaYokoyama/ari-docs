import MDEditor from "@uiw/react-md-editor";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { getDoc } from "@/api/docs";
import { useTheme } from "@/app/theme";
import {
  baseId,
  linkifyIds,
  parseList,
  resolveRelativePath,
  showGuides,
  stripFrontMatter,
} from "@/pages/docs/checkDocs";
import Mermaid from "@/pages/docs/Mermaid";
import type { DocEntry } from "@/types/docs";

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

// コードブロックの文字列を取り出す（ハイライト済みでも元の文字列に戻す）
function hastText(node: HastNode): string {
  if (node.type === "text") {
    return node.value ?? "";
  }
  return (node.children ?? []).map(hastText).join("");
}

// ```mermaid のコードブロックなら、その code 要素を返す
function mermaidCode(pre: HastNode | undefined) {
  const code = pre?.children?.find((child) => child.tagName === "code");
  const className = code?.properties?.className;
  return Array.isArray(className) && className.includes("language-mermaid")
    ? code
    : undefined;
}

type Props = {
  root: string;
  doc: DocEntry;
  warnings: string[];
  idIndex: Map<string, string>;
  onSelect: (path: string) => void;
};

const STATUS_COLORS: Record<string, string> = {
  草案: "bg-accent text-foreground/80",
  レビュー中: "bg-warning/15 text-amber-700 dark:text-amber-300",
  確定: "bg-success/15 text-green-700 dark:text-green-300",
  廃止: "bg-destructive/10 text-destructive",
};

function DocViewer({ root, doc, warnings, idIndex, onSelect }: Props) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [guideVisible, setGuideVisible] = useState(true);
  const { resolved: colorMode } = useTheme();

  useEffect(() => {
    setError("");
    getDoc(root, doc.path)
      .then((response) => setContent(response.content))
      .catch((e) => {
        console.error(e);
        setContent("");
        setError("文書の取得に失敗しました");
      });
  }, [root, doc.path]);

  const openId = (id: string) => {
    const path = idIndex.get(baseId(id));
    if (path) {
      onSelect(path);
    }
  };

  let body = stripFrontMatter(content);
  body = guideVisible ? showGuides(body) : body;
  body = linkifyIds(body, idIndex);

  const fm = doc.frontMatter;
  const related = parseList(fm.related);

  return (
    <div className="mx-auto max-w-5xl px-8 py-6">
      <p className="mb-2 text-xs text-muted-foreground">{doc.path}</p>

      {doc.hasFrontMatter && (
        <div className="mb-4 rounded-md border border-border bg-background p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono font-semibold">{fm.id}</span>
            <span className="text-base font-semibold">{fm.title}</span>
            {fm.type && (
              <span className="rounded bg-accent px-2 py-0.5 text-xs">
                {fm.type}
              </span>
            )}
            {fm.status && (
              <span
                className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[fm.status] ?? "bg-accent"}`}
              >
                {fm.status}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              更新: {fm.updated}
            </span>
          </div>
          {related.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">関連:</span>
              {related.map((id) =>
                idIndex.has(baseId(id)) ? (
                  <button
                    key={id}
                    type="button"
                    onClick={() => openId(id)}
                    className="rounded border border-border px-1.5 py-0.5 font-mono hover:bg-accent"
                  >
                    {id}
                  </button>
                ) : (
                  <span
                    key={id}
                    className="rounded border border-destructive/40 px-1.5 py-0.5 font-mono text-destructive"
                  >
                    {id}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {warnings.map((warning) => (
            <p key={warning} className="flex items-center gap-2">
              <TriangleAlert size={14} className="shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      )}

      <label className="mb-3 flex items-center gap-2 text-xs text-foreground/80">
        <input
          type="checkbox"
          checked={guideVisible}
          onChange={(e) => setGuideVisible(e.target.checked)}
        />
        記入ガイド（&lt;!-- --&gt;）を表示する
      </label>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div data-color-mode={colorMode}>
          <MDEditor.Markdown
            source={body}
            components={{
              pre: ({ node, children, ...props }) => {
                const code = mermaidCode(node as HastNode | undefined);
                if (code) {
                  return <Mermaid chart={hastText(code).trim()} />;
                }
                return <pre {...props}>{children}</pre>;
              },
              a: ({ href, children }) => {
                if (href?.startsWith("#doc:")) {
                  return (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        openId(href.slice("#doc:".length));
                      }}
                    >
                      {children}
                    </a>
                  );
                }
                if (href && !/^[a-z]+:/i.test(href) && href.includes(".md")) {
                  return (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelect(resolveRelativePath(doc.path, href));
                      }}
                    >
                      {children}
                    </a>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          />
        </div>
      )}
    </div>
  );
}

export default DocViewer;
