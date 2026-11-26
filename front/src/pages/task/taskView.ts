import { type AriLink, parseAriLink } from "@/lib/ariLink";
import type { Task, TaskPriority, TaskRepeat, TaskStatus } from "@/types/task";

// 表示に使う名前・色・並べ方（FN0602）

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "未着手" },
  { value: "doing", label: "進行中" },
  { value: "done", label: "完了" },
];

export const PRIORITIES: { value: TaskPriority; label: string; className: string }[] = [
  { value: "high", label: "高", className: "bg-destructive/10 text-destructive" },
  { value: "medium", label: "中", className: "bg-warning/15 text-warning" },
  { value: "low", label: "低", className: "bg-muted text-muted-foreground" },
];

export const REPEATS: { value: TaskRepeat; label: string }[] = [
  { value: "", label: "なし" },
  { value: "daily", label: "毎日" },
  { value: "weekdays", label: "平日（土日・祝日を除く）" },
  { value: "weekly", label: "毎週" },
  { value: "monthly", label: "毎月" },
];

export function repeatLabel(value: TaskRepeat) {
  return REPEATS.find((item) => item.value === value)?.label ?? "";
}

export function priorityOf(value: TaskPriority) {
  return PRIORITIES.find((item) => item.value === value) ?? PRIORITIES[1];
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const STATUS_RANK: Record<TaskStatus, number> = { todo: 0, doing: 1, done: 2 };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 今日（この PC の日付。YYYY-MM-DD）
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// 今日から days 日後（YYYY-MM-DD）
export function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 期限をすぐ選ぶボタン
export const QUICK_DUES = [
  { label: "今日", days: 0 },
  { label: "明日", days: 1 },
  { label: "1 週間後", days: 7 },
];

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 期限の見え方。過ぎた（完了でない）・今日・3 日以内・それ以外
export function dueInfo(task: Pick<Task, "dueDate" | "status">) {
  if (!task.dueDate) {
    return null;
  }
  const [y, m, d] = task.dueDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const [ty, tm, td] = today().split("-").map(Number);
  const days = Math.round((date.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  const sameYear = y === ty;
  const label = `${sameYear ? "" : `${y}/`}${m}/${d}（${WEEKDAYS[date.getDay()]}）`;
  const done = task.status === "done";
  const state = done ? "done" : days < 0 ? "overdue" : days === 0 ? "today" : days <= 3 ? "soon" : "later";
  const note = done ? "" : days < 0 ? `${-days} 日過ぎ` : days === 0 ? "今日" : days === 1 ? "明日" : "";
  return { label, state, note };
}

export const DUE_CLASS: Record<string, string> = {
  overdue: "text-destructive",
  today: "text-warning",
  soon: "text-foreground",
  later: "text-muted-foreground",
  done: "text-muted-foreground",
};

// 一覧の並べ方（FN0602-BR05）。「近い順」の向きは、期限は近い順・優先度は高い順・状態は未着手から・追加は新しい順
export type ListSortKey = "due" | "priority" | "status" | "created";
export type ListSort = { key: ListSortKey; desc: boolean };

export const LIST_SORTS: { value: ListSortKey; label: string; asc: string; desc: string }[] = [
  { value: "due", label: "期限", asc: "期限の近い順", desc: "期限の遠い順" },
  { value: "priority", label: "優先度", asc: "優先度の高い順", desc: "優先度の低い順" },
  { value: "status", label: "状態", asc: "未着手から", desc: "完了から" },
  { value: "created", label: "追加", asc: "追加の新しい順", desc: "追加の古い順" },
];

export const DEFAULT_LIST_SORT: ListSort = { key: "due", desc: false };

// 期限の比べ方。期限の無いものは向きによらず後
function compareDue(a: Task, b: Task, desc: boolean) {
  if (!a.dueDate || !b.dueDate) {
    return Number(!a.dueDate) - Number(!b.dueDate);
  }
  const order = a.dueDate.localeCompare(b.dueDate);
  return desc ? -order : order;
}

// 一覧の並び。状態で並べるとき以外も、完了は下にまとめる。同じなら期限の近い順 → 優先度の高い順
export function compareForList(sort: ListSort) {
  const sign = sort.desc ? -1 : 1;
  return (a: Task, b: Task) => {
    const done = Number(a.status === "done") - Number(b.status === "done");
    let primary: number;
    if (sort.key === "status") {
      primary = sign * (STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    } else if (sort.key === "due") {
      primary = done || compareDue(a, b, sort.desc);
    } else if (sort.key === "priority") {
      primary = done || sign * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
    } else {
      primary = done || -sign * a.createdAt.localeCompare(b.createdAt);
    }
    return (
      primary ||
      compareDue(a, b, false) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.sortOrder - b.sortOrder
    );
  };
}

// 足すときの文の終わりの言葉を期限・優先度にする（FN0602-BR11）。「資料を送る 明日」「定例 金曜 !高」など。
// 空白で区切った最後の言葉から順に読み、読めない言葉が来たらそこまでをタイトルにする
const WEEKDAY_WORDS = ["日", "月", "火", "水", "木", "金", "土"];
const PRIORITY_WORDS: Record<string, TaskPriority> = { "!高": "high", "!中": "medium", "!低": "low", "！高": "high", "！中": "medium", "！低": "low" };

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toHalfWidth(text: string) {
  return text.replace(/[０-９／]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

// 1 つの言葉を日付にする。読めなければ null
export function parseDueWord(word: string, now = new Date()): string | null {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const after = (days: number) => {
    const date = new Date(base);
    date.setDate(date.getDate() + days);
    return ymd(date);
  };
  const text = toHalfWidth(word);
  const fixed: Record<string, number> = { 今日: 0, きょう: 0, 明日: 1, あした: 1, 明後日: 2, あさって: 2, 来週: 7 };
  if (text in fixed) {
    return after(fixed[text]);
  }
  let match = /^(\d{1,3})日後$/.exec(text);
  if (match) {
    return after(Number(match[1]));
  }
  // 金曜・金曜日（今日を含めて次のその曜日）・来週金曜（来週の月〜日のその曜日）
  match = /^(来週)?([日月火水木金土])曜日?$/.exec(text);
  if (match) {
    const target = WEEKDAY_WORDS.indexOf(match[2]);
    const today = base.getDay();
    if (match[1]) {
      // 来週の月曜からの日数（日曜は週の終わり）
      const toNextMonday = ((8 - today) % 7) || 7;
      return after(toNextMonday + ((target + 6) % 7));
    }
    return after((target - today + 7) % 7);
  }
  // 12/5・12月5日・2027/1/5（年が無く、今日より前なら来年）
  match = /^(?:(\d{4})[/年])?(\d{1,2})[/月](\d{1,2})日?$/.exec(text);
  if (match) {
    const year = match[1] ? Number(match[1]) : base.getFullYear();
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    let date = new Date(year, month, day);
    if (date.getMonth() !== month || date.getDate() !== day) {
      return null;
    }
    if (!match[1] && date < base) {
      date = new Date(year + 1, month, day);
    }
    return ymd(date);
  }
  return null;
}

export function parseTaskText(text: string, now = new Date()) {
  const words = text.trim().split(/[\s\u3000]+/);
  let dueDate = "";
  let priority: TaskPriority | null = null;
  // タイトルは 1 語は残す
  while (words.length > 1) {
    const last = words[words.length - 1];
    if (!priority && PRIORITY_WORDS[last]) {
      priority = PRIORITY_WORDS[last];
    } else {
      const due = dueDate ? null : parseDueWord(last, now);
      if (!due) {
        break;
      }
      dueDate = due;
    }
    words.pop();
  }
  return { title: words.join(" "), dueDate, priority };
}

// メモに書いた ari:// のリンク（FN0602-BR12）。同じものは 1 つ
export function findAriLinks(text: string): { text: string; link: AriLink }[] {
  const found = new Map<string, AriLink>();
  for (const match of text.matchAll(/ari:\/\/[^\s<>)\]]+/gi)) {
    const link = parseAriLink(match[0]);
    if (link && !found.has(match[0])) {
      found.set(match[0], link);
    }
  }
  return [...found].map(([text, link]) => ({ text, link }));
}
