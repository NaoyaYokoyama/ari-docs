import { currentPlaceId } from "@/app/places";
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

// このウィンドウで行のドラッグを始めたフォルダ。ほかのウィンドウ（FN0301-BR36）から来たドラッグなら null
let dragSource: string | null = null;

// 行のドラッグを始める。場所（自分の PC・共有サーバー）も入れる（パスは同じ場所の中でしか使えないため）
export function startNodeDrag(dataTransfer: DataTransfer, paths: string[], folder: string) {
  dragSource = folder;
  dataTransfer.setData(NODE_DRAG_TYPE, JSON.stringify({ place: currentPlaceId(), paths }));
  dataTransfer.effectAllowed = "copyMove";
}

export function endNodeDrag() {
  dragSource = null;
}

// このウィンドウのこのフォルダから始めたドラッグか（同じフォルダへのドロップは何もしない）
export function isDragFrom(folder: string) {
  return dragSource === folder;
}

type DragData = { place: string; paths: string[] };

function dragData(dataTransfer: DataTransfer): DragData | null {
  try {
    const data = JSON.parse(dataTransfer.getData(NODE_DRAG_TYPE)) as DragData;
    return data && typeof data.place === "string" && Array.isArray(data.paths) ? data : null;
  } catch {
    return null;
  }
}

// 一覧の行のドラッグで運ぶパス。ほかの場所のウィンドウから来たものは空
export function draggedPaths(dataTransfer: DataTransfer): string[] {
  const data = dragData(dataTransfer);
  return data && data.place === currentPlaceId() ? data.paths : [];
}

// ほかの場所（自分の PC と共有サーバーなど）のウィンドウから来たドラッグか
export function isFromOtherPlace(dataTransfer: DataTransfer) {
  const data = dragData(dataTransfer);
  return !!data && data.place !== currentPlaceId();
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
