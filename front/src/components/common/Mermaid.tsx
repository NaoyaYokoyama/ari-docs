import { type ComponentProps, createContext, useContext, useEffect, useId, useRef, useState } from "react";

import { useTheme } from "@/app/theme";

type Props = {
  chart: string;
};

// mermaid は大きいので、図を表示するときに初めて読み込む
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      return mermaid;
    });
  }
  return mermaidPromise;
}

// 図の配色を画面の配色と変えるとき（印刷は紙に合わせて明るい配色。FN0401-BR18）
export const MermaidThemeContext = createContext<"light" | "dark" | null>(null);

// 編集中のプレビューで、打つたびに描き直して誤りの表示が点滅しないよう、少し待ってから描く
const RENDER_DELAY_MS = 300;

function Mermaid({ chart }: Props) {
  const id = `mermaid-${useId().replace(/:/g, "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const { resolved } = useTheme();
  const colorMode = useContext(MermaidThemeContext) ?? resolved;
  const drawn = useRef(false);

  useEffect(() => {
    let canceled = false;
    const draw = () =>
      loadMermaid()
        .then((mermaid) => {
          // 画面の配色に合わせる
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: colorMode === "dark" ? "dark" : "default",
          });
          return mermaid.render(id, chart);
        })
        .then((result) => {
          if (!canceled) {
            setSvg(result.svg);
            setError("");
          }
        })
        .catch((e) => {
          // 描けなかったとき、mermaid が作業に使った要素が body に残るので消す
          document.getElementById(`d${id}`)?.remove();
          document.getElementById(id)?.remove();
          if (!canceled) {
            setError(e instanceof Error ? e.message : String(e));
          }
        });
    // 初めはすぐ描き、2 回目からは書き換えが止まるのを待つ
    const timer = window.setTimeout(draw, drawn.current ? RENDER_DELAY_MS : 0);
    drawn.current = true;
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [id, chart, colorMode]);

  if (!svg && !error) {
    // 描くまでは場所だけ取る
    return <div className="my-4 h-24 animate-pulse rounded-md bg-muted" />;
  }

  // 書き方の誤りで描画できないときは、原文とエラーを表示する
  if (error) {
    return (
      <div className="my-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <p className="mb-2 text-destructive">
          mermaid の図を描画できません: {error}
        </p>
        <pre className="text-xs whitespace-pre-wrap">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      className="my-4 flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default Mermaid;

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

// コードブロックの文字列を取り出す（色付け済みでも元の文字列に戻す）
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
  return Array.isArray(className) && className.includes("language-mermaid") ? code : undefined;
}

// Markdown の表示の pre の代わり。```mermaid は図にし、ほかはそのまま（Note・Wiki・Folder の .md・Docs。FN0404-BR08）
export function MermaidPre({ node, children, ...props }: ComponentProps<"pre"> & { node?: unknown }) {
  const code = mermaidCode(node as HastNode | undefined);
  if (code) {
    return <Mermaid chart={hastText(code).trim()} />;
  }
  return <pre {...props}>{children}</pre>;
}
