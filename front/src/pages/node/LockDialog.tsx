import { useEffect, useState } from "react";

import { lockNode } from "@/api/node";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";
import { errorMessage } from "@/lib/format";
import type { Node } from "@/types/node";

type Props = {
  // ロックするファイル（null なら閉じている）
  node: Node | null;
  onClose: () => void;
  onLocked: () => void;
};

const DAY = 24 * 60 * 60 * 1000;

// datetime-local の値（この PC の時刻。YYYY-MM-DDTHH:MM）
function toInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 一覧の期限（YYYY/MM/DD HH:MM）を日時にする
function fromListTime(value: string) {
  const date = new Date(value.replace(/\//g, "-").replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

// ファイルのロック（FN0301-BR38）。期限の日時を選ぶ。上限はサーバーの設定（既定 7 日）
export default function LockDialog({ node, onClose, onLocked }: Props) {
  const { user, showMessage } = useApp();
  const maxDays = user?.fileLockMaxDays ?? 7;
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!node) {
      return;
    }
    const current = new Date();
    setNow(current);
    // 期限を変えるときは今の期限、新しくロックするときは 1 日後（上限が短ければ上限）
    const existing = node.lock?.mine ? fromListTime(node.lock.expiresAt) : null;
    const initial = existing ?? new Date(current.getTime() + Math.min(1, maxDays) * DAY);
    setValue(toInput(initial));
    setError("");
    setSaving(false);
  }, [node, maxDays]);

  const max = new Date(now.getTime() + maxDays * DAY);
  const selected = value ? new Date(value) : null;
  const invalid = !selected || Number.isNaN(selected.getTime())
    ? "期限の日時を選んでください"
    : selected.getTime() <= Date.now()
      ? "期限は今より後の日時にしてください"
      : selected.getTime() > max.getTime() + 60_000
        ? `期限は ${maxDays} 日後まで（サーバーの設定）にしてください`
        : "";

  const submit = async () => {
    if (!node || !selected || invalid || saving) {
      return;
    }
    setSaving(true);
    try {
      await lockNode(node.path, selected);
      showMessage("info", `「${node.name}」をロックしました`);
      onLocked();
    } catch (e) {
      setError(errorMessage(e, "ロックできませんでした"));
      setSaving(false);
    }
  };

  const changing = !!node?.lock?.mine;

  return (
    <Dialog
      open={node !== null}
      title={changing ? "ロックの期限を変える" : "ファイルをロック"}
      description={node?.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={!!invalid || saving} onClick={submit}>
            {saving ? "ロックしています..." : changing ? "期限を変える" : "ロック"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        ロックしている間、ほかの人はこのファイルの上書き・名前の変更・移動・削除ができません（開く・ダウンロード・コピーはできます）。期限が来ると自動で外れます。管理者はいつでも外せます。
      </p>
      <label htmlFor="lock-expires" className="mb-1.5 block text-sm font-medium">
        期限
      </label>
      <Input
        id="lock-expires"
        type="datetime-local"
        autoFocus
        value={value}
        min={toInput(now)}
        max={toInput(max)}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        className="w-full"
      />
      <p className="mt-1.5 text-xs text-muted-foreground">{maxDays} 日後（{toInput(max).replace("T", " ")}）まで選べます</p>
      <p className="mt-1 min-h-4 text-xs text-destructive">{(value && invalid) || error}</p>
    </Dialog>
  );
}
