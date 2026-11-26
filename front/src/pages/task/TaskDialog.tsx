import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";
import { dateAfter, PRIORITIES, QUICK_DUES, REPEATS, STATUSES } from "@/pages/task/taskView";
import type { Task, TaskInput, TaskPriority, TaskRepeat, TaskStatus } from "@/types/task";

type Props = {
  // 変えるタスク（null なら閉じている）
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task, input: TaskInput) => Promise<boolean>;
  onDelete: (task: Task) => void;
};

const TITLE_MAX = 100;

// タスクの詳細（FN0602）。タイトル・優先度・期限・状態・メモを変える
export default function TaskDialog({ task, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [description, setDescription] = useState("");
  const [repeat, setRepeat] = useState<TaskRepeat>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority);
      setDueDate(task.dueDate);
      setStatus(task.status);
      setDescription(task.description);
      setRepeat(task.repeat ?? "");
      setSaving(false);
    }
  }, [task]);

  const invalid = !title.trim()
    ? "タイトルを入力してください"
    : title.trim().length > TITLE_MAX
      ? `タイトルは ${TITLE_MAX} 文字までです`
      : "";

  const save = async () => {
    if (!task || invalid || saving) {
      return;
    }
    setSaving(true);
    const saved = await onSave(task, { title: title.trim(), priority, dueDate, status, description, repeat });
    if (!saved) {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={task !== null}
      title="タスク"
      onClose={onClose}
      className="max-w-lg"
      footer={
        <>
          <Button variant="danger" onClick={() => task && onDelete(task)} className="mr-auto">
            削除
          </Button>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={!!invalid || saving} onClick={() => void save()}>
            保存
          </Button>
        </>
      }
    >
      <div
        className="space-y-4"
        onKeyDown={(e) => {
          // Ctrl+Enter（メモの中でも）で保存
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div>
          <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium">
            タイトル
          </label>
          <Input
            id="task-title"
            autoFocus
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.ctrlKey) {
                e.preventDefault();
                void save();
              }
            }}
            className="w-full"
          />
          <p className="mt-1 min-h-4 text-xs text-destructive">{title ? invalid : ""}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium">優先度</span>
            <div role="radiogroup" aria-label="優先度" className="flex gap-1">
              {PRIORITIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={priority === item.value}
                  onClick={() => setPriority(item.value)}
                  className={twMerge(
                    "h-9 flex-1 rounded-md border text-sm",
                    priority === item.value
                      ? twMerge("border-transparent font-medium", item.className)
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="task-status" className="mb-1.5 block text-sm font-medium">
              状態
            </label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              {STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="task-due" className="mb-1.5 block text-sm font-medium">
            期限
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-48"
            />
            {QUICK_DUES.map((item) => {
              const value = dateAfter(item.days);
              return (
                <Button
                  key={item.label}
                  variant={dueDate === value ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={dueDate === value}
                  onClick={() => setDueDate(value)}
                >
                  {item.label}
                </Button>
              );
            })}
            {dueDate && (
              <Button variant="ghost" size="sm" onClick={() => setDueDate("")}>
                なし
              </Button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="task-repeat" className="mb-1.5 block text-sm font-medium">
            繰り返し
          </label>
          <div className="flex items-center gap-3">
            <select
              id="task-repeat"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as TaskRepeat)}
              className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              {REPEATS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            {repeat && <span className="text-xs text-muted-foreground">完了にすると、次の回のタスクを作ります</span>}
          </div>
        </div>

        <div>
          <label htmlFor="task-description" className="mb-1.5 block text-sm font-medium">
            メモ
          </label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="やることの詳しいこと・リンクなど（Ctrl+Enter で保存）"
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>
    </Dialog>
  );
}
