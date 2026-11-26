import { invoke, isTauri } from "@tauri-apps/api/core";

import { setCurrentPlace } from "@/app/places";

// 新しいウィンドウ（FN0301-BR36）。デスクトップアプリでは同じアプリの窓を増やし、ブラウザでは新しいタブで開く。
// 窓は同じ場所（自分の PC・共有サーバー）・同じ画面で開く。画面に渡すもの（location.state）は state で渡す
export async function openNewWindow(page: string, state: unknown, placeId: string | undefined) {
  const params = new URLSearchParams({ page });
  if (state !== undefined && state !== null) {
    params.set("state", JSON.stringify(state));
  }
  if (placeId) {
    params.set("place", placeId);
  }
  const url = `/?${params.toString()}`;
  if (isTauri()) {
    await invoke("open_window", { url });
  } else {
    window.open(url, "_blank");
  }
}

// 新しいウィンドウで開いたとき: 画面を描く前に、渡された場所と画面にする（start.tsx）
export function applyWindowStart() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");
  if (window.location.pathname !== "/" || !page?.startsWith("/") || page.startsWith("//")) {
    return;
  }
  const place = params.get("place");
  if (place) {
    setCurrentPlace(place);
  }
  let state: unknown;
  try {
    state = JSON.parse(params.get("state") ?? "null");
  } catch {
    state = null;
  }
  // React Router は history.state の usr を location.state にする
  window.history.replaceState({ usr: state, key: "window", idx: 0 }, "", page);
}

// Folder の画面で開いているフォルダ。新しいウィンドウ（Ctrl+Shift+N）で同じフォルダを開くため。Folder の外では null
let windowFolder: string | null = null;

export function setWindowFolder(path: string | null) {
  windowFolder = path;
}

// 今の画面を新しいウィンドウで開く。Folder は開いているフォルダ、ほかの画面は URL と渡されたもの
export function openCurrentInNewWindow(placeId: string | undefined) {
  const { pathname, search } = window.location;
  const state =
    pathname === "/folder" && windowFolder !== null
      ? { nodePath: windowFolder }
      : (window.history.state as { usr?: unknown } | null)?.usr;
  return openNewWindow(pathname + search, state, placeId);
}

// ファイル・フォルダを変えたことをほかのウィンドウに知らせる。ほかのウィンドウは一覧を読み直す
const CHANNEL = "ari-docs-nodes";
let channel: BroadcastChannel | null = null;

function nodesChannel() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
  }
  return channel;
}

export function notifyNodesChanged() {
  nodesChannel()?.postMessage("changed");
}

// ほかのウィンドウで変えたとき・このウィンドウに戻ってきたとき（外で変えたものも映すため）に呼ぶ。戻り値で止める
export function onNodesChanged(handler: () => void) {
  const current = nodesChannel();
  const handleMessage = () => handler();
  current?.addEventListener("message", handleMessage);
  window.addEventListener("focus", handler);
  return () => {
    current?.removeEventListener("message", handleMessage);
    window.removeEventListener("focus", handler);
  };
}
