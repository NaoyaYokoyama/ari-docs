import type { UploadFile } from "@/types/uploadFile";

// フォルダ画面のドラッグ＆ドロップ（OS のファイルのアップロードと、一覧の行の移動・コピー。FN0301-BR06・BR19・BR20）

// 一覧の行をドラッグするときのデータの種類（OS のファイルのドロップと見分けるため）
export const NODE_DRAG_TYPE = "application/x-ari-nodes";

async function readEntry(entry: FileSystemEntry, path = ""): Promise<UploadFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    return [{ file, relativePath: path + file.name }];
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const files: UploadFile[] = [];
    // readEntries は 1 回で全部を返すとは限らないため、空になるまで読む
    for (;;) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (entries.length === 0) {
        break;
      }
      for (const child of entries) {
        files.push(...(await readEntry(child, path + entry.name + "/")));
      }
    }
    return files;
  }

  return [];
}

// ドロップされた OS のファイル・フォルダ（フォルダは中の構成を保つ）
export async function filesFromDrop(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const files: UploadFile[] = [];
  for (const entry of entries) {
    files.push(...(await readEntry(entry)));
  }
  return files;
}

// 一覧の行のドラッグで運ぶパス
export function draggedPaths(dataTransfer: DataTransfer): string[] {
  try {
    const paths = JSON.parse(dataTransfer.getData(NODE_DRAG_TYPE));
    return Array.isArray(paths) ? paths : [];
  } catch {
    return [];
  }
}

// dest へ paths を移せるか（自分自身・自分の中へは移せない）
export function canDropInto(paths: string[], dest: string) {
  return paths.every((path) => dest !== path && !dest.startsWith(`${path}/`));
}

export function isNodeDrag(event: React.DragEvent) {
  return event.dataTransfer.types.includes(NODE_DRAG_TYPE);
}

export function isFileDrag(event: React.DragEvent) {
  return event.dataTransfer.types.includes("Files");
}

// Ctrl（macOS は Option）を押しながらドロップするとコピー（Windows のエクスプローラーと同じ）
export function wantsCopy(event: React.DragEvent) {
  return event.ctrlKey || event.altKey;
}
