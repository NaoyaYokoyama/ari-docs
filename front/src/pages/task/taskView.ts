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
