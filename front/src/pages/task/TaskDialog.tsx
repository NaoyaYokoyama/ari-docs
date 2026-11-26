import { BookOpen, File, FileText, Folder } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

import { useOpenAriLink } from "@/app/useAriLink";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";
import { type AriLink, ariLinkLabel } from "@/lib/ariLink";
import { dateAfter, findAriLinks, PRIORITIES, QUICK_DUES, REPEATS, STATUSES } from "@/pages/task/taskView";
import type { Task, TaskInput, TaskPriority, TaskRepeat, TaskStatus } from "@/types/task";

type Props = {
  // 変えるタスク（null なら閉じている）
  task: Task | null;
  onClose: () => void;
  onSave: (task: Task, input: TaskInput) => Promise<boolean>;
  onDelete: (task: Task) => void;
};

const TITLE_MAX = 100;

const LINK_ICONS = { file: File, folder: Folder, note: FileText, wiki: BookOpen };

function linkPlace(link: AriLink) {
  if ("path" in link) {
    return link.path.split("/").slice(0, -1).join("/") || "folder";
  }
  return "";
}

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
      return false;
    }
    setSaving(true);
    const saved = await onSave(task, { title: title.trim(), priority, dueDate, status, description, repeat });
    if (!saved) {
      setSaving(false);
    }
    return saved;
  };

  // メモの ari:// のリンク（FN0602-BR12）。開くときは先に保存する（書いたものが消えないように）
  const links = useMemo(() => findAriLinks(description), [description]);
  const openAriLink = useOpenAriLink();
  const openLink = async (link: AriLink) => {
    if (invalid || (await save())) {
      if (invalid) {
        onClose();
      }
      openAriLink(link);
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
            placeholder="やることの詳しいこと・ari:// のリンクなど（Ctrl+Enter で保存）"
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          {links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {links.map(({ text, link }) => {
                const Icon = LINK_ICONS[link.kind];
                return (
                  <li key={text}>
                    <button
                      type="button"
                      onClick={() => void openLink(link)}
                      title={`${text}（保存して開く）`}
                      className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Icon size={14} className="shrink-0 text-brand" />
                      <span className="truncate">{ariLinkLabel(link)}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{linkPlace(link)}</span>
                      <span className="shrink-0 text-xs text-brand">開く</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
