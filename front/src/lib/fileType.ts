import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  type LucideIcon,
  Presentation,
} from "lucide-react";

type FileKind = { icon: LucideIcon; className: string };

const KINDS: { extensions: string[]; kind: FileKind }[] = [
  {
    extensions: ["xlsx", "xlsm", "xlsb", "xls", "csv", "tsv", "ods"],
    kind: { icon: FileSpreadsheet, className: "text-success" },
  },
  {
    extensions: ["docx", "docm", "doc", "rtf", "odt"],
    kind: { icon: FileText, className: "text-brand" },
  },
  {
    extensions: ["pptx", "pptm", "ppt", "odp"],
    kind: { icon: Presentation, className: "text-warning" },
  },
  { extensions: ["pdf"], kind: { icon: FileText, className: "text-destructive" } },
  {
    extensions: ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "heic", "tif", "tiff"],
    kind: { icon: FileImage, className: "text-muted-foreground" },
  },
  {
    extensions: ["zip", "7z", "lzh", "rar", "tar", "gz"],
    kind: { icon: FileArchive, className: "text-muted-foreground" },
  },
  { extensions: ["mp4", "mov", "avi", "wmv", "mkv"], kind: { icon: FileVideo, className: "text-muted-foreground" } },
  { extensions: ["mp3", "wav", "m4a", "aac"], kind: { icon: FileAudio, className: "text-muted-foreground" } },
  {
    extensions: ["js", "ts", "tsx", "jsx", "py", "java", "rs", "go", "c", "cpp", "cs", "sql", "json", "xml", "html", "css", "sh", "bat", "ps1", "yml", "yaml", "toml"],
    kind: { icon: FileCode, className: "text-muted-foreground" },
  },
  { extensions: ["txt", "md", "log"], kind: { icon: FileText, className: "text-muted-foreground" } },
];

export function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

// 種類ごとのアイコンと色（Excel は緑、Word は青、PowerPoint は橙、PDF は赤）
export function fileKind(name: string, folder: boolean): FileKind {
  if (folder) {
    return { icon: Folder, className: "fill-brand/15 text-brand" };
  }
  const extension = extensionOf(name);
  return (
    KINDS.find((entry) => entry.extensions.includes(extension))?.kind ?? {
      icon: File,
      className: "text-muted-foreground",
    }
  );
}

// 例: 512 B、1.2 KB、3.4 MB
export function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

// 名前の拡張子の前まで（名前の変更で拡張子を選ばない状態にするため）。"memo.txt" -> 4
export function stemLength(name: string) {
  const index = name.lastIndexOf(".");
  return index > 0 ? index : name.length;
}

// 同じ名前を避けた名前。"memo.txt" -> "memo (2).txt"（Windows のエクスプローラーと同じ付け方）
export function uniqueName(name: string, taken: Set<string>) {
  if (!taken.has(name)) {
    return name;
  }
  const index = name.lastIndexOf(".");
  const [stem, ext] = index > 0 ? [name.slice(0, index), name.slice(index)] : [name, ""];
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}
