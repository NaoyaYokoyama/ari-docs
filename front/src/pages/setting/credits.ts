// クレジット（設定の「クレジット」。FN0903-BR05）。人を足すときはここに書き足す
export type CreditPerson = {
  name: string;
  // 一言（何をしてくれたか・所属など）。任意
  note?: string;
};

export const AUTHOR: CreditPerson = { name: "Naoya Yokoyama", note: "作成・開発" };

// 不具合の報告・アイデア・試用などで協力してくれた人
export const CONTRIBUTORS: CreditPerson[] = [];

// 開発を支援してくれた人・会社
export const SPONSORS: CreditPerson[] = [];

// アプリに組み込んでいる主な第三者のソフトウェア。全文は配布物の THIRD_PARTY_NOTICES.txt
export const THIRD_PARTY: { name: string; license: string }[] = [
  { name: "Tauri", license: "MIT / Apache-2.0" },
  { name: "React", license: "MIT" },
  { name: "axum・tokio", license: "MIT" },
  { name: "SQLite（rusqlite）", license: "Public Domain / MIT" },
  { name: "lindera・IPADIC（単語の区切り）", license: "MIT / IPADIC" },
  { name: "PaddleOCR PP-OCRv6（文字認識のモデル）", license: "Apache-2.0" },
  { name: "ONNX Runtime", license: "MIT" },
  { name: "oar-ocr・ort", license: "Apache-2.0 / MIT" },
  { name: "hayro（PDF の描画）", license: "MIT / Apache-2.0" },
  { name: "lucide（アイコン）", license: "ISC" },
  { name: "Inter（字体）", license: "OFL-1.1" },
];
