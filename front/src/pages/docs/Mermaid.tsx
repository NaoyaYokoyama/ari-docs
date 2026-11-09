import { useEffect, useId, useState } from "react";

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

function Mermaid({ chart }: Props) {
  const id = `mermaid-${useId().replace(/:/g, "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const { resolved: colorMode } = useTheme();

  useEffect(() => {
    let canceled = false;
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
        if (!canceled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      canceled = true;
    };
  }, [id, chart, colorMode]);

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
