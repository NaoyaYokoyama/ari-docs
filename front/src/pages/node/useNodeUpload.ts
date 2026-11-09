import { useState } from "react";

import { getNodes, uploadNode } from "@/api/node";
import { useApp } from "@/app/AppContext";
import { uniqueName } from "@/lib/fileType";
import { errorMessage } from "@/lib/format";
import { baseName } from "@/pages/node/nodePath";
import type { ConflictChoice } from "@/pages/node/UploadConflictDialog";
import type { Node } from "@/types/node";
import type { UploadFile } from "@/types/uploadFile";

type Options = {
  currentPath: string;
  // 表示中のフォルダの一覧（同じ名前を確かめるため）
  nodes: Node[];
  refresh: () => Promise<void>;
};

// アップロード（FN0301-BR06・BR23）。同じ名前があれば「置き換える・両方残す・キャンセル」を選ばせ、進み具合を出す
export function useNodeUpload({ currentPath, nodes, refresh }: Options) {
  const { showMessage } = useApp();
  // 進み具合（0〜1）。null はアップロードしていない
  const [progress, setProgress] = useState<number | null>(null);
  // 同じ名前の確認。resolve で選んだものを返す
  const [conflict, setConflict] = useState<{
    names: string[];
    resolve: (choice: ConflictChoice) => void;
  } | null>(null);

  const askConflict = (names: string[]) =>
    new Promise<ConflictChoice>((resolve) => setConflict({ names, resolve }));

  const upload = async (files: UploadFile[], destPath: string) => {
    if (progress !== null) {
      showMessage("error", "アップロード中です。終わってからもう一度お試しください");
      return;
    }
    let existing: string[];
    try {
      existing =
        destPath === currentPath
          ? nodes.map((node) => node.name)
          : (await getNodes(destPath)).nodes.map((node) => node.name);
    } catch (e) {
      showMessage("error", errorMessage(e, "アップロード先のフォルダを読み込めませんでした"));
      return;
    }
    const taken = new Set(existing);
    const topNames = [...new Set(files.map((item) => item.relativePath.split("/")[0]))];
    const conflicts = topNames.filter((name) => taken.has(name));
    let targets = files;
    if (conflicts.length > 0) {
      const choice = await askConflict(conflicts);
      setConflict(null);
      if (choice === "cancel") {
        return;
      }
      if (choice === "keepBoth") {
        const used = new Set([...existing, ...topNames]);
        const renamed = new Map<string, string>();
        for (const name of conflicts) {
          const next = uniqueName(name, used);
          used.add(next);
          renamed.set(name, next);
        }
        targets = files.map((item) => {
          const [top, ...rest] = item.relativePath.split("/");
          const next = renamed.get(top);
          return next ? { ...item, relativePath: [next, ...rest].join("/") } : item;
        });
      }
    }

    setProgress(0);
    try {
      await uploadNode(targets, destPath, setProgress);
      const where = destPath === currentPath ? "" : `「${baseName(destPath)}」に`;
      showMessage("info", `${where}${targets.length} 件アップロードしました`);
    } catch (e) {
      showMessage("error", errorMessage(e, "アップロードに失敗しました"));
    } finally {
      setProgress(null);
      await refresh();
    }
  };

  return { progress, conflict, upload };
}

// ファイル選択（input type="file"）で選んだもの。フォルダを選んだときは「選んだフォルダ/中のパス」にする
export function pickedFiles(list: FileList | null, folder: boolean): UploadFile[] {
  return Array.from(list ?? []).map((file) => ({
    file,
    relativePath: folder && file.webkitRelativePath ? file.webkitRelativePath : file.name,
  }));
}
