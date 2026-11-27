import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { MermaidThemeContext } from "@/components/common/Mermaid";
import ContentMarkdown from "@/pages/content/ContentMarkdown";

type Props = {
  title: string;
  content: string;
  // 印刷の下に出す一言（更新日時など）
  meta: string;
  // 画像・図を描き終えたら（長くても 5 秒で）呼ぶ
  onReady: () => void;
};

const WAIT_LIMIT_MS = 5000;

// 印刷する中身（FN0401-BR18）。body の直下に置き、印刷のときだけこれだけを出す（global.css の .ari-print）。
// 紙に合わせて、画面がダークでも明るい配色で出す
export default function PrintView({ title, content, meta, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const started = Date.now();
    let timer = 0;
    // 画像・図は読み込むまで場所だけ取っている（animate-pulse）。それが無くなるのを待つ
    const check = () => {
      const loading = ref.current?.querySelector(".animate-pulse");
      if (!loading || Date.now() - started > WAIT_LIMIT_MS) {
        onReady();
        return;
      }
      timer = window.setTimeout(check, 100);
    };
    timer = window.setTimeout(check, 300);
    return () => window.clearTimeout(timer);
  }, [onReady]);

  return createPortal(
    <div ref={ref} className="ari-print" data-color-mode="light">
      <h1 className="ari-print-title">{title}</h1>
      <p className="ari-print-meta">{meta}</p>
      <MermaidThemeContext.Provider value="light">
        <ContentMarkdown source={content} />
      </MermaidThemeContext.Provider>
    </div>,
    document.body,
  );
}
