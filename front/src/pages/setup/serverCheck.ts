// 共有サーバーの URL で ari-docs の共有モードが動いているかを確かめる（FN0002-BR18。インストーラーと同じ確かめ方）。
// 動いていなければ理由の文を投げる。待つのは 5 秒まで
const TIMEOUT_MS = 5000;

export async function checkServer(url: string) {
  let response: Response;
  try {
    response = await fetch(`${url}/api/server-info`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error(
      "サーバーに接続できません。URL と、サーバーが動いているか（HTTPS なら証明書）を確認してください",
    );
  }
  const info = await response.json().catch(() => null);
  if (!response.ok || info?.app !== "ari-docs") {
    throw new Error("この URL は ari-docs のサーバーではありません");
  }
  if (info.mode !== "shared") {
    throw new Error("このサーバーは共有モードで動いていません");
  }
}
