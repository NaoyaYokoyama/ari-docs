import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useSyncExternalStore } from "react";

import { useApp } from "@/app/AppContext";
import { errorMessage } from "@/lib/format";

// デスクトップアプリの更新（docs の FN0904）。お知らせ（UpdateNotice）と設定の「情報」で同じ状態を使う

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; version: string; currentVersion: string; notes: string }
  | { kind: "installing"; version: string; percent: number | null }
  | { kind: "error"; message: string };

// notes は変更点（無ければ空。FN0904-BR13）
type UpdateInfo = { version: string; currentVersion: string; notes: string };
type UpdateProgress = { downloaded: number; total: number | null };

// Tauri のコマンドの失敗は文字で返る
function reason(error: unknown) {
  return typeof error === "string" ? error : errorMessage(error, String(error));
}

let state: UpdateState = { kind: "idle" };
// お知らせの「あとで」（次に起動するまで出さない。FN0904-BR05）
let dismissed = false;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdateState() {
  return useSyncExternalStore(subscribe, () => state);
}

export function useUpdateDismissed() {
  return useSyncExternalStore(subscribe, () => dismissed);
}

export function dismissUpdate() {
  dismissed = true;
  listeners.forEach((listener) => listener());
}

// 新しい版を調べる。serverUrl は今の場所の共有サーバー（自分の PC は空文字で GitHub Releases。FN0904-BR02）
export async function checkUpdate(serverUrl: string): Promise<UpdateState> {
  if (state.kind === "checking" || state.kind === "installing") {
    return state;
  }
  set({ kind: "checking" });
  try {
    const info = await invoke<UpdateInfo | null>("check_update", { serverUrl });
    set(info ? { kind: "available", ...info, notes: info.notes ?? "" } : { kind: "latest" });
  } catch (error) {
    set({ kind: "error", message: `更新を確認できませんでした。${reason(error)}` });
  }
  return state;
}

// 取ってきて入れ替え、再起動する。うまくいけば戻ってこない
async function installUpdate(): Promise<UpdateState> {
  if (state.kind !== "available") {
    return state;
  }
  const { version } = state;
  set({ kind: "installing", version, percent: null });
  const unlisten = await listen<UpdateProgress>("ari-docs://update-progress", ({ payload }) => {
    const percent = payload.total ? Math.floor((payload.downloaded * 100) / payload.total) : null;
    set({ kind: "installing", version, percent });
  });
  try {
    await invoke("install_update");
  } catch (error) {
    set({ kind: "error", message: `更新できませんでした。${reason(error)}` });
  } finally {
    unlisten();
  }
  return state;
}

// 「更新して再起動」。保存していない変更があれば先に確かめる（FN0904-BR10）
export function useInstallUpdate() {
  const { isDirty, showConfirm, showMessage } = useApp();
  return useCallback(async () => {
    if (isDirty && !(await showConfirm("保存していない変更があります。更新して再起動しますか？"))) {
      return;
    }
    const result = await installUpdate();
    if (result.kind === "error") {
      showMessage("error", result.message);
    }
  }, [isDirty, showConfirm, showMessage]);
}
