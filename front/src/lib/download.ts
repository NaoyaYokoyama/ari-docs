import { invoke, isTauri } from "@tauri-apps/api/core";

// ダウンロードしたファイルの保存・表示。デスクトップアプリは Tauri のコマンドで、ブラウザは <a download> で行う

async function sendToDesktop(command: string, name: string, blob: Blob) {
  return invoke(command, new Uint8Array(await blob.arrayBuffer()), {
    headers: { "x-file-name": encodeURIComponent(name) },
  });
}

function saveInBrowser(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 保存先を選んで保存する。キャンセルしたら false
export async function saveBlob(name: string, blob: Blob): Promise<boolean> {
  if (isTauri()) {
    return (await sendToDesktop("save_download", name, blob)) as boolean;
  }
  saveInBrowser(name, blob);
  return true;
}

// 一時フォルダに保存して OS のアプリで開く。デスクトップアプリは保存を見張り、その ID を返す（editSync）。
// ブラウザでは開けないため保存して null を返す
export async function openBlob(name: string, blob: Blob): Promise<number | null> {
  if (isTauri()) {
    return (await sendToDesktop("open_download", name, blob)) as number;
  }
  saveInBrowser(name, blob);
  return null;
}
