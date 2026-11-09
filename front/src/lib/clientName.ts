import { isTauri } from "@tauri-apps/api/core";

// 端末の名前（例: Windows・デスクトップアプリ、macOS・Chrome）。ログインのときに送り、設定の「ログイン中の端末」に出す（FN0101-BR15）
export function clientName(userAgent = navigator.userAgent, desktop = isTauri()) {
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /iPhone|iPad/.test(userAgent)
      ? "iPhone・iPad"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Android/.test(userAgent)
          ? "Android"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "不明な OS";
  if (desktop) {
    return `${os}・デスクトップアプリ`;
  }
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "ブラウザ";
  return `${os}・${browser}`;
}

// 保存された値が User-Agent そのもの（古いログイン）なら名前に直す
export function displayClientName(client: string) {
  if (!client) {
    return "不明な端末";
  }
  return client.startsWith("Mozilla/") ? clientName(client, false) : client;
}
