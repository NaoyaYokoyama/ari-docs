import { isTauri } from "@tauri-apps/api/core";
import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";

import { setBaseUrl, setPlaceScope } from "@/api/client";
import { getSetupStatus, savePlaces } from "@/api/setup";
import { DesktopContext, type DesktopInfo } from "@/app/DesktopContext";
import { initialPlace, type Place, placeList, rememberPlace } from "@/app/places";
import Spinner from "@/components/common/Spinner";
import FirstRun from "@/pages/setup/FirstRun";
import { checkServer } from "@/pages/setup/serverCheck";
import ServerUnreachable from "@/pages/setup/ServerUnreachable";
import Setup from "@/pages/setup/Setup";
import type { PlacesConfig, SetupStatus } from "@/types/setup";

// デスクトップアプリの起動の状態で表示を分ける。
// - 初回起動（使い方が未選択）: 使い方を選ぶ画面
// - 場所を決める（切り替えた場所 → 起動したときの場所。FN0002-BR20）
// - 自分の PC: バックエンドを起動できなかったら起動エラーの画面
// - 共有サーバー: API の接続先をそのサーバーにする。つながらなければ、つながらないときの画面（FN0002-BR19）
// ブラウザ（開発時）ではそのまま表示する
export default function DesktopGate({ children }: PropsWithChildren) {
  const desktop = isTauri();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  // 共有サーバーにつながらなかった理由（つながった・確かめていないときは空文字）
  const [serverError, setServerError] = useState("");

  const connect = async (serverUrl: string) => {
    try {
      await checkServer(serverUrl);
      setServerError("");
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (desktop) {
      getSetupStatus()
        .then(async (status) => {
          const place = initialPlace(status.places);
          rememberPlace(place.id);
          if (place.local && status.apiPort && status.apiPort !== 8080) {
            setBaseUrl(`http://localhost:${status.apiPort}`);
          }
          if (!place.local) {
            // 場所はこの読み込みの間は変わらない（切り替えは読み込み直す）
            setBaseUrl(place.url);
            setPlaceScope(place.url);
            await connect(place.url);
          }
          setPlace(place);
          setStatus(status);
        })
        .catch(console.error);
    }
  }, [desktop]);

  const save = useCallback(async (places: PlacesConfig) => {
    const next = await savePlaces(places);
    setStatus(next);
    // 今の場所の名前・色を変えたときは表示も変える（今の共有サーバーを消したときは次に切り替えるまでそのまま）
    setPlace((current) => placeList(next.places).find((item) => item.id === current?.id) ?? current);
  }, []);

  const value = useMemo<DesktopInfo | null>(
    () =>
      status && place
        ? { status, place, places: placeList(status.places), savePlaces: save }
        : null,
    [status, place, save],
  );

  if (!desktop) {
    return children;
  }
  if (!status || !place || !value) {
    return <Spinner className="h-screen" label="起動中..." />;
  }
  if (status.firstRun && !status.error) {
    return <FirstRun />;
  }
  if (place.local && !status.configured) {
    return <Setup status={status} places={value.places} />;
  }
  if (!place.local && serverError) {
    return (
      <ServerUnreachable place={place} places={value.places} error={serverError} onRetry={() => connect(place.url)} />
    );
  }
  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}
