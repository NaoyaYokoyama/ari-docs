import { useCallback, useEffect } from "react";

import { getServerInfo } from "@/api/auth";
import { useApp } from "@/app/AppContext";
import { useDesktop } from "@/app/DesktopContext";
import { LOCAL_PLACE_ID, type Place, switchPlace } from "@/app/places";
import { useGuardedNavigate } from "@/app/useGuardedNavigate";
import { type AriLink, ariLinkTarget, getLinkServer, parseAriLink, setLinkServer, toAriLink } from "@/lib/ariLink";

// 場所を切り替えてから開くリンク（切り替えると画面を読み込み直すため、この起動の間だけ控える。FN0004-BR07）
const PENDING_KEY = "ari-docs-pending-link";
// 共有サーバーの ID を確かめるのに待つ時間
const TIMEOUT_MS = 3000;

function readPending() {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(value: string | null) {
  try {
    if (value === null) {
      sessionStorage.removeItem(PENDING_KEY);
    } else {
      sessionStorage.setItem(PENDING_KEY, value);
    }
  } catch {
    // 控えられなければ、切り替えたあとに開かないだけ
  }
}

// 場所を切り替えたあとに開くリンクがあるか（起動したときの画面へ移らないため。MainLayout）
export function hasPendingAriLink() {
  return readPending() !== null;
}

// 登録した共有サーバーの中から、その ID のサーバーを探す（つながらないものは飛ばす）
async function findPlace(places: Place[], server: string) {
  const results = await Promise.all(
    places
      .filter((place) => !place.local)
      .map(async (place) => {
        try {
          const response = await fetch(`${place.url}/api/server-info`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          const info = await response.json();
          return info?.serverId === server ? place : null;
        } catch {
          return null;
        }
      }),
  );
  return results.find((place) => place !== null) ?? null;
}

// 今の場所を決め（リンクを作るときに入れる）、場所を切り替える前に頼まれたリンクを開く。ログインした画面で 1 回（MainLayout）
export function useAriLinkPlace() {
  const openAriLink = useOpenAriLink();
  useEffect(() => {
    let cancelled = false;
    getServerInfo()
      .then((info) => {
        if (!cancelled) {
          setLinkServer(info.mode === "local" ? LOCAL_PLACE_ID : info.serverId || undefined);
        }
      })
      .catch(console.error)
      .finally(() => {
        const pending = readPending();
        writePending(null);
        const link = pending ? parseAriLink(pending) : null;
        if (!cancelled && link) {
          openAriLink(link);
        }
      });
    return () => {
      cancelled = true;
    };
    // 起動したときに 1 回だけ
  }, []);
}

// ari-docs の中のリンク（FN0004）を開く。ほかの場所のリンクなら、デスクトップアプリはその場所に切り替えてから開く（FN0004-BR07）
export function useOpenAriLink() {
  const navigate = useGuardedNavigate();
  const desktop = useDesktop();
  const { showMessage } = useApp();
  return useCallback(
    (link: AriLink) => {
      const open = () => {
        const target = ariLinkTarget(link);
        void navigate(target.path, { state: target.state });
      };
      const current = getLinkServer();
      // 場所の無いリンク（前の版で作ったもの）・今の場所のリンク・今の場所が分からないときは、そのまま開く
      if (!link.server || !current || link.server === current) {
        open();
        return;
      }
      if (!desktop) {
        showMessage("error", "このリンクは別の ari-docs（ほかの場所）のものなので、ここでは開けません");
        return;
      }
      const switchTo = (place: Place) => {
        writePending(toAriLink(link));
        showMessage("info", `「${place.name}」に切り替えて開きます`);
        switchPlace(place.id);
      };
      if (link.server === LOCAL_PLACE_ID) {
        switchTo(desktop.places[0]);
        return;
      }
      void findPlace(desktop.places, link.server).then((place) => {
        if (place) {
          switchTo(place);
        } else {
          showMessage(
            "error",
            "このリンクは、登録していない（またはつながらない）共有サーバーのものです。設定の「場所」で登録すると開けます",
          );
        }
      });
    },
    [navigate, desktop, showMessage],
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
