import { useEffect, useState } from "react";

import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";

const MAX_LENGTH = 25;

type Props = {
  // null なら閉じている
  open: { title: string; description?: string; initial: string; submitLabel: string } | null;
  onClose: () => void;
  // 成功したら閉じる。失敗したらエラー文言を返す
  onSubmit: (name: string) => Promise<string | null>;
};

// Note・Wiki のフォルダの名前（作成・名前の変更。FN0403）
export default function FolderNameDialog({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(open.initial);
      setError("");
      setSaving(false);
    }
  }, [open]);

  const trimmed = name.trim();

  const submit = async () => {
    if (!trimmed || saving) {
      return;
    }
    setSaving(true);
    const message = await onSubmit(trimmed);
    if (message) {
      setError(message);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!open}
      title={open?.title ?? ""}
      description={open?.description}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={!trimmed || saving} onClick={submit}>
            {open?.submitLabel}
          </Button>
        </>
      }
    >
      <label className="mb-1.5 block text-sm font-medium" htmlFor="content-folder-name">
        フォルダの名前
      </label>
      <Input
        id="content-folder-name"
        autoFocus
        value={name}
        maxLength={MAX_LENGTH}
        onChange={(e) => {
          setName(e.target.value);
          setError("");
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        className="w-full"
      />
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-destructive">{error}</span>
        <span className="text-muted-foreground">
          {name.length} / {MAX_LENGTH}
        </span>
      </div>
    </Dialog>
  );
}
