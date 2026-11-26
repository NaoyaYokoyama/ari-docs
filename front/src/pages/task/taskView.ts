import type { Task, TaskPriority, TaskStatus } from "@/types/task";

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

// 一覧の並び: 状態（未着手・進行中・完了）→ 期限の近い順（無いものは後）→ 優先度の高い順
export function compareForList(a: Task, b: Task) {
  return (
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.sortOrder - b.sortOrder
  );
}
