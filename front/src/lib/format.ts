// 日時の表示。
// - Note・Wiki の更新日時は SQLite の CURRENT_TIMESTAMP（UTC の "YYYY-MM-DD HH:MM:SS"）
// - ノードの更新日時はサーバーの現地時刻の "YYYY/MM/DD HH:MM"
function parseDateTime(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return new Date(value.replace(" ", "T") + "Z");
  }
  const local = value.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/);
  if (local) {
    const [, y, m, d, hh, mm] = local.map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// 例: 2026/10/15 09:30
export function formatDateTime(value: string) {
  const date = parseDateTime(value);
  if (!date) {
    return value;
  }
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 一覧向けの短い表示。例: たった今・5 分前・3 時間前・昨日・10/12・2025/12/01
export function formatRelative(value: string, now = new Date()) {
  const date = parseDateTime(value);
  if (!date) {
    return value;
  }
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) {
    return "たった今";
  }
  if (minutes < 60) {
    return `${minutes} 分前`;
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= startOfToday) {
    return `${Math.floor(minutes / 60)} 時間前`;
  }
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  if (date >= startOfYesterday) {
    return "昨日";
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

// 並べ替え用の数値（読めない値は 0）
export function timeOf(value: string) {
  return parseDateTime(value)?.getTime() ?? 0;
}

// 全角・半角と大文字・小文字を区別しないで比べるための正規化
export function normalizeText(text: string) {
  return text.normalize("NFKC").toLowerCase();
}

// API のエラーから画面に出す文言を取り出す
export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message && error.message !== "Request failed"
    ? error.message
    : fallback;
}
