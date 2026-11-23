import { invoke } from "@tauri-apps/api/core";

import type { PlacesConfig, SetupStatus, WorkspaceInfo } from "@/types/setup";

// デスクトップアプリの作業フォルダ・場所の処理（Tauri のコマンド）。ブラウザでは使えない

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

// 初回起動で使い方を決める。serverUrl が空なら自分の PC だけ。成功するとアプリが再起動する
export function completeFirstRun(serverUrl: string) {
  return invoke<void>("complete_first_run", { serverUrl });
}

// この PC を共有サーバーとして公開する（FN0005）。最初の管理者を登録し、今のデータをその管理者に移す。成功するとアプリが再起動する
export function publishHost(userId: string, displayName: string, password: string, port: number) {
  return invoke<void>("publish_host", { userId, displayName, password, port });
}

// 公開のポートを変える（FN0005-BR10）。成功するとアプリが再起動する
export function setHostPort(port: number) {
  return invoke<void>("set_host_port", { port });
}

// 公開をやめる（false）・また公開する（true）。成功するとアプリが再起動する
export function setPublish(publish: boolean) {
  return invoke<void>("set_publish", { publish });
}

// 場所を保存する（再起動しない）。保存したあとの起動の状態を返す
export function savePlaces(places: PlacesConfig) {
  return invoke<SetupStatus>("save_places", { places });
}
