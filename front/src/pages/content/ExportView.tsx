import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { MermaidThemeContext } from "@/components/common/Mermaid";
import ContentMarkdown from "@/pages/content/ContentMarkdown";

type Props = {
  content: string;
  // 画像・図を描き終えたら（長くても 5 秒で）、描いた本文の要素を渡して呼ぶ
  onReady: (element: HTMLElement) => void;
};

const WAIT_LIMIT_MS = 5000;

// 書き出す本文を見えないところで描く（FN0401-BR18）。HTML のファイルにするため（contentExport.ts の buildHtml）。
// 紙・ほかの PC で見るので、画面がダークでも図は明るい配色で描く
export default function ExportView({ content, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const started = Date.now();
    let timer = 0;
    // 画像・図は読み込むまで場所だけ取っている（animate-pulse）。それが無くなるのを待つ
    const check = () => {
      const element = ref.current;
      if (!element) {
        return;
      }
      if (!element.querySelector(".animate-pulse") || Date.now() - started > WAIT_LIMIT_MS) {
        onReady(element);
        return;
      }
      timer = window.setTimeout(check, 100);
    };
    timer = window.setTimeout(check, 300);
    return () => window.clearTimeout(timer);
  }, [onReady]);

  return createPortal(
    <div ref={ref} className="ari-export" data-color-mode="light" aria-hidden>
      <MermaidThemeContext.Provider value="light">
        <ContentMarkdown source={content} />
      </MermaidThemeContext.Provider>
    </div>,
    document.body,
  );
}
