import { isTauri } from "@tauri-apps/api/core";
import { type PropsWithChildren, useEffect, useState } from "react";

import { setBaseUrl } from "@/api/client";
import { getSetupStatus } from "@/api/setup";
import { DesktopContext } from "@/app/DesktopContext";
import Spinner from "@/components/common/Spinner";
import FirstRun from "@/pages/setup/FirstRun";
import { checkServer } from "@/pages/setup/serverCheck";
import ServerUnreachable from "@/pages/setup/ServerUnreachable";
import Setup from "@/pages/setup/Setup";
import type { SetupStatus } from "@/types/setup";

// デスクトップアプリの起動の状態で表示を分ける。
// - 初回起動（使い方が未選択）: 使い方を選ぶ画面
// - バックエンドを起動できなかった: 起動エラーの画面
// - 共有サーバーに接続: API の接続先をそのサーバーにする。つながらなければ、つながらないときの画面（FN0002-BR19）
// ブラウザ（開発時）ではそのまま表示する
export default function DesktopGate({ children }: PropsWithChildren) {
  const desktop = isTauri();
  const [status, setStatus] = useState<SetupStatus | null>(null);
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
          if (status.mode === "server" && status.serverUrl) {
            setBaseUrl(status.serverUrl);
            if (status.configured) {
              await connect(status.serverUrl);
            }
          }
          setStatus(status);
        })
        .catch(console.error);
    }
  }, [desktop]);

  if (!desktop) {
    return children;
  }
  if (!status) {
    return <Spinner className="h-screen" label="起動中..." />;
  }
  if (!status.mode && !status.error) {
    return <FirstRun />;
  }
  if (!status.configured) {
    return <Setup status={status} />;
  }
  if (serverError) {
    return <ServerUnreachable status={status} error={serverError} onRetry={() => connect(status.serverUrl)} />;
  }
  return (
    <DesktopContext.Provider value={status}>{children}</DesktopContext.Provider>
  );
}
