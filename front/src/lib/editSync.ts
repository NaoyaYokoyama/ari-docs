import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { getNodes, uploadNode } from "@/api/node";
import { uniqueName } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";

// 共有サーバーから開いたファイルを、保存されたら自動でサーバーに戻す（FN0301-BR28）。
// デスクトップアプリが一時フォルダのファイルを見張り、保存されると ari-docs://file-changed で知らせる

type Opened = {
  // サーバーのパス（folder/ からの相対パス）
  path: string;
  name: string;
  parentPath: string;
  // 開いたとき（または最後に戻したとき）のサーバーの更新日時とサイズ。ほかの人の更新と見分けるため
  updatedAt: string;
  size: number;
};

const opened = new Map<number, Opened>();

// 変更をサーバーに戻したら知らせる（フォルダ画面が一覧を読み込み直す）
export const NODES_CHANGED_EVENT = "ari-docs:nodes-changed";

export function watchOpened(watchId: number, file: Opened) {
  opened.set(watchId, file);
}

function parentOf(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export function openedFile(path: string, name: string, updatedAt: string, size: number): Opened {
  return { path, name, parentPath: parentOf(path), updatedAt, size };
}

type Callbacks = {
  showMessage: (type: "info" | "error", text: string) => void;
  showConfirm: (message: string) => Promise<boolean>;
};

async function syncBack(watchId: number, { showMessage, showConfirm }: Callbacks) {
  const file = opened.get(watchId);
  if (!file) {
    return;
  }
  try {
    const current = (await getNodes(file.parentPath)).nodes;
    const server = current.find((node) => node.name === file.name);
    let name = file.name;
    // 開いたあとにほかの人がサーバーのファイルを更新していたら、上書きするか確かめる
    if (server && (server.updatedAt !== file.updatedAt || server.size !== file.size)) {
      const overwrite = await showConfirm(
        `サーバーの「${file.name}」は、開いたあとにほかの人が更新しています。上書きしますか？「キャンセル」を押すと、別の名前で保存します`,
      );
      if (!overwrite) {
        name = uniqueName(file.name, new Set(current.map((node) => node.name)));
      }
    }
    const bytes = await invoke<ArrayBuffer>("read_watched", { watchId });
    await uploadNode([{ file: new File([bytes], name), relativePath: name }], file.parentPath);
    const after = (await getNodes(file.parentPath)).nodes.find((node) => node.name === name);
    if (name === file.name && after) {
      opened.set(watchId, { ...file, updatedAt: after.updatedAt, size: after.size });
    }
    showMessage("info", `「${name}」の変更をサーバーに保存しました`);
    window.dispatchEvent(new Event(NODES_CHANGED_EVENT));
  } catch (error) {
    console.error(error);
    showMessage("error", errorMessage(error, `「${file.name}」の変更をサーバーに保存できませんでした`));
  }
}

// アプリの起動時に 1 回だけ呼ぶ。戻り値で止める
export async function startEditSync(callbacks: Callbacks) {
  if (!isTauri()) {
    return () => {};
  }
  // 同じファイルの知らせが続いたときは、前の保存が終わってから次を行う
  let queue = Promise.resolve();
  return listen<number>("ari-docs://file-changed", (event) => {
    queue = queue.then(() => syncBack(event.payload, callbacks));
  });
}
