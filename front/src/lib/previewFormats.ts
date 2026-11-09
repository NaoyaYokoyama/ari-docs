// Folder でプレビュー（Space）できる形式（FN0301-BR30）。PreviewDialog と設定の「対応するファイル」で使う
export type PreviewKind = "image" | "pdf" | "markdown" | "csv" | "text";

export const PREVIEW_FORMATS: { kind: PreviewKind; name: string; extensions: string[]; note?: string }[] = [
  { kind: "image", name: "画像", extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"] },
  { kind: "pdf", name: "PDF", extensions: ["pdf"] },
  { kind: "markdown", name: "Markdown", extensions: ["md", "markdown"], note: "見出し・表などを整えて表示" },
  { kind: "csv", name: "CSV・TSV", extensions: ["csv", "tsv"], note: "表で表示（先頭 500 行まで）" },
  {
    kind: "text",
    name: "テキスト",
    extensions: [
      "txt", "log", "json", "xml", "html", "htm", "yml", "yaml", "toml", "ini", "cfg", "conf", "properties",
      "sql", "sh", "bat", "cmd", "ps1", "js", "jsx", "ts", "tsx", "py", "java", "kt", "c", "h", "cpp", "hpp",
      "cs", "vb", "go", "rs", "rb", "php", "css", "scss", "vue",
    ],
    note: "UTF-8・Shift_JIS",
  },
];

// プレビューする大きさの上限（大きなファイルを読み込んで画面が固まらないように）
export const MAX_PREVIEW_BYTES = 30 * 1024 * 1024;
