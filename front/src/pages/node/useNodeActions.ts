import { useCallback, useState } from "react";

import { createFavoriteNode, deleteFavorite } from "@/api/favorite";
import {
  copyNodes,
  deleteNode,
  downloadNode,
  downloadZip,
  moveNodes,
  openNode,
  renameNode,
  revealNode,
} from "@/api/node";
import { useApp } from "@/app/AppContext";
import { getPreferences } from "@/app/preferences";
import { openBlob, saveBlob } from "@/lib/download";
import { openedFile, watchOpened } from "@/lib/editSync";
import { errorMessage } from "@/lib/format";
import { canDropInto } from "@/pages/node/nodeDrag";
import { baseName, joinPath, parentPath } from "@/pages/node/nodePath";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

export type Clipboard = { mode: "copy" | "cut"; paths: string[] };

type Options = {
  currentPath: string;
  shared: boolean;
  setSelected: (selected: Set<string>) => void;
  refresh: () => Promise<void>;
  // フォルダを開く
  navigateTo: (path: string) => void;
};

// フォルダ画面の操作（開く・移動・コピー・貼り付け・ゴミ箱・名前の変更・ダウンロードなど。FN0301）
export function useNodeActions({ currentPath, shared, setSelected, refresh, navigateTo }: Options) {
  const { showMessage, showConfirm } = useApp();
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const open = async (node: Node) => {
    if (node.nodeType === NodeType.Folder) {
      navigateTo(node.path);
      return;
    }
    try {
      // 共有サーバーのファイルは、ダウンロードしてこの PC のアプリで開く（FN0301-BR21）。
      // 保存したら自動でサーバーに戻す（FN0301-BR28）
      if (shared) {
        const watchId = await openBlob(node.name, await downloadNode(node.path));
        if (watchId !== null) {
          watchOpened(watchId, openedFile(node.path, node.name, node.updatedAt, node.size));
          showMessage("info", `「${node.name}」を開きました。保存すると、変更を自動でサーバーに保存します`);
        }
        return;
      }
      await openNode(node.path);
    } catch (e) {
      showMessage("error", errorMessage(e, "ファイルを開けませんでした"));
    }
  };

  // 移動・コピー（FN0301-BR19・BR20）
  const transfer = async (paths: string[], destPath: string, copy: boolean) => {
    try {
      if (copy) {
        const { names } = await copyNodes(paths, destPath);
        showMessage("info", `${names.length} 件コピーしました`);
        if (destPath === currentPath) {
          setSelected(new Set(names.map((name) => joinPath(destPath, name))));
        }
      } else {
        await moveNodes(paths, destPath);
        showMessage("info", `「${baseName(destPath) || "folder"}」に ${paths.length} 件移動しました`);
        setSelected(new Set());
      }
    } catch (e) {
      showMessage("error", errorMessage(e, copy ? "コピーに失敗しました" : "移動に失敗しました"));
    }
    await refresh();
  };

  const copyToClipboard = (mode: Clipboard["mode"], targets: Node[]) => {
    if (targets.length === 0) {
      return;
    }
    setClipboard({ mode, paths: targets.map((node) => node.path) });
    showMessage(
      "info",
      `${targets.length} 件を${mode === "copy" ? "コピー" : "切り取り"}しました。貼り付ける場所で Ctrl+V を押してください`,
    );
  };

  const paste = async (destPath: string) => {
    if (!clipboard) {
      return;
    }
    if (clipboard.mode === "cut") {
      if (!canDropInto(clipboard.paths, destPath)) {
        showMessage("error", "フォルダをその中へは移動できません");
        return;
      }
      setClipboard(null);
      await transfer(clipboard.paths, destPath, false);
    } else {
      await transfer(clipboard.paths, destPath, true);
    }
  };

  // 削除はゴミ箱へ移すので確認しない（FN0302-BR01。ゴミ箱から元に戻せる）。設定で確かめるようにもできる（FN0701）
  const remove = async (targets: Node[]) => {
    if (targets.length === 0) {
      return;
    }
    if (
      getPreferences().confirmDelete &&
      !(await showConfirm(
        `${targets.length > 1 ? `${targets.length} 件` : `「${targets[0].name}」`}をゴミ箱に移動しますか？`,
      ))
    ) {
      return;
    }
    let failed = 0;
    let lastError: unknown = null;
    for (const node of targets) {
      try {
        await deleteNode(parentPath(node.path), node.nodeType as NodeType, node.name);
      } catch (e) {
        console.error(e);
        failed += 1;
        lastError = e;
      }
    }
    if (failed === 0) {
      showMessage(
        "info",
        `${targets.length > 1 ? `${targets.length} 件` : `「${targets[0].name}」`}をゴミ箱に移動しました（ゴミ箱から元に戻せます）`,
      );
    } else {
      showMessage("error", errorMessage(lastError, `${failed} 件を削除できませんでした`));
    }
    setSelected(new Set());
    await refresh();
  };

  // 名前の変更の終わり（FN0301-BR18）。newName が null なら取り消し
  const rename = useCallback(
    async (node: Node, newName: string | null) => {
      if (!newName || newName === node.name) {
        return;
      }
      try {
        await renameNode(parentPath(node.path), node.name, newName);
        setSelected(new Set([joinPath(parentPath(node.path), newName)]));
        showMessage("info", `「${newName}」に変更しました`);
      } catch (e) {
        showMessage("error", errorMessage(e, "名前を変更できませんでした"));
      }
      await refresh();
    },
    [refresh, setSelected, showMessage],
  );

  const download = async (node: Node) => {
    try {
      if (await saveBlob(node.name, await downloadNode(node.path))) {
        showMessage("info", `「${node.name}」をダウンロードしました`);
      }
    } catch (e) {
      showMessage("error", errorMessage(e, "ダウンロードに失敗しました"));
    }
  };

  // ZIP にまとめてダウンロード（FN0301-BR27）
  const downloadAsZip = async (targets: Node[]) => {
    if (targets.length === 0) {
      return;
    }
    try {
      const name =
        targets.length === 1
          ? `${targets[0].name.replace(/\.[^.]+$/, "") || targets[0].name}.zip`
          : `${baseName(currentPath) || "folder"}.zip`;
      showMessage("info", "ZIP を作っています...");
      if (await saveBlob(name, await downloadZip(targets.map((node) => node.path)))) {
        showMessage("info", `「${name}」をダウンロードしました`);
      }
    } catch (e) {
      showMessage("error", errorMessage(e, "ZIP でダウンロードできませんでした"));
    }
  };

  const reveal = async (node: Node) => {
    try {
      await revealNode(node.path);
    } catch (e) {
      showMessage("error", errorMessage(e, "場所を開けませんでした"));
    }
  };

  const toggleFavorite = async (node: Node) => {
    try {
      if (node.favoriteId) {
        await deleteFavorite(node.favoriteId);
        showMessage("info", "お気に入り解除しました");
      } else {
        await createFavoriteNode(node.path);
        showMessage("info", "お気に入り登録しました");
      }
    } catch (e) {
      console.error(e);
      showMessage("error", node.favoriteId ? "お気に入り解除に失敗しました" : "お気に入り登録に失敗しました");
    }
    await refresh();
  };

  return {
    clipboard,
    clearCut: () => setClipboard((current) => (current?.mode === "cut" ? null : current)),
    open,
    transfer,
    copyToClipboard,
    paste,
    remove,
    rename,
    download,
    downloadAsZip,
    reveal,
    toggleFavorite,
  };
}
