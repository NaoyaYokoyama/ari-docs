import { useCallback } from "react";

import { useApp } from "@/app/AppContext";
import { useGuardedNavigate } from "@/app/useGuardedNavigate";
import { type AriLink, ariLinkTarget, toAriLink } from "@/lib/ariLink";

// ari-docs の中のリンク（FN0004）を開く
export function useOpenAriLink() {
  const navigate = useGuardedNavigate();
  return useCallback(
    (link: AriLink) => {
      const target = ariLinkTarget(link);
      void navigate(target.path, { state: target.state });
    },
    [navigate],
  );
}

// リンクをクリップボードに入れる（複数なら 1 行に 1 つ）。name はお知らせに出す名前
export function useCopyAriLink() {
  const { showMessage } = useApp();
  return useCallback(
    async (links: AriLink[], name: string) => {
      if (links.length === 0) {
        return;
      }
      try {
        await navigator.clipboard.writeText(links.map(toAriLink).join("\n"));
        showMessage(
          "info",
          links.length === 1
            ? `「${name}」のリンクをコピーしました（ari-docs の探して開く（Ctrl+P）に貼ると開けます${
                links[0].kind === "note" ? "。Note は自分しか開けません" : ""
              }）`
            : `${links.length} 件のリンクをコピーしました`,
        );
      } catch (error) {
        console.error(error);
        showMessage("error", "リンクをコピーできませんでした");
      }
    },
    [showMessage],
  );
}
