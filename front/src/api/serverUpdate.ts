import { getServerInfo } from "@/api/auth";
import { get, post, postForm } from "@/api/client";

// サーバーの更新（FN0904-BR14〜BR19。API0913〜API0915）。共有モードの管理者（登録した PC）だけ

export type ServerUpdateStatus = {
  currentVersion: string;
  // 画面から更新できないときの理由
  unsupported?: string;
  // GitHub Releases の新しい版
  latest?: { version: string; notes: string };
  // GitHub に聞けなかったときの理由
  checkError?: string;
};

export function getServerUpdate(refresh = false) {
  return get<ServerUpdateStatus>(`/api/server-update${refresh ? "?refresh=true" : ""}`);
}

// GitHub の最新の版を取ってきて入れ替える。答えを返したあと、サーバーは起動し直す
export function applyServerUpdate() {
  return post<{ message: string }>("/api/server-update/apply", {});
}

// 管理者が上げたサーバー一式（.tar.gz）と署名（.sig）で入れ替える
export async function uploadServerUpdate(file: File, signature: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("signature", await signature.text());
  await postForm<void>("/api/server-update/upload", form);
}

// 起動し直したサーバーが新しい版で答えるまで待つ（2 秒ごと、2 分まで）。戻ったら新しい版を返す
export async function waitForServer(previousVersion: string): Promise<string | null> {
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // 起動し直している間はつながらない
    const version = await getServerInfo()
      .then((info) => info.version)
      .catch(() => null);
    if (version && version !== previousVersion) {
      return version;
    }
  }
  return null;
}
