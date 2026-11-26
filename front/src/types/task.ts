// 個人のタスク（FN0602）
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "doing" | "done";
// 繰り返し（FN0602-BR10）。空はなし
export type TaskRepeat = "" | "daily" | "weekdays" | "weekly" | "monthly";

export interface Task {
  taskId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  // 期限（YYYY-MM-DD。無ければ空）
  dueDate: string;
  status: TaskStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  repeat: TaskRepeat;
  // WBS（FN0602-BR14）。親（空なら一番上）・開始日（YYYY-MM-DD。無ければ空）・同じ親の中の並び
  parentId: string;
  startDate: string;
  wbsOrder: number;
}

export type TaskInput = Partial<
  Pick<Task, "title" | "description" | "priority" | "dueDate" | "status" | "repeat" | "startDate" | "parentId">
>;
