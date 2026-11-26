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
}

export type TaskInput = Partial<Pick<Task, "title" | "description" | "priority" | "dueDate" | "status" | "repeat">>;
