import { invoke } from "@tauri-apps/api/core";

import type { SetupStatus, WorkspaceInfo } from "@/types/setup";

// デスクトップアプリの作業フォルダの処理（Tauri のコマンド）。ブラウザでは使えない

export function getSetupStatus() {
  return invoke<SetupStatus>("setup_status");
}

export function inspectWorkspace(path: string) {
  return invoke<WorkspaceInfo>("inspect_workspace", { path });
}

// 成功するとアプリが再起動する
export function changeWorkspace(path: string) {
  return invoke<void>("change_workspace", { path });
}

// 使い方（local: 個人用 / server: 共有サーバーに接続）を変える。成功するとアプリが再起動する
export function changeMode(mode: "local" | "server", serverUrl: string) {
  return invoke<void>("change_mode", { mode, serverUrl });
}
