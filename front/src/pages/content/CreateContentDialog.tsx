import { useEffect, useState } from "react";

import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";
import type { ContentKind } from "@/pages/content/contentKinds";

type Props = {
  kind: ContentKind;
  open: boolean;
  // 作る場所（フォルダの場所。空なら一番上。FN0403）
  place?: string;
  onClose: () => void;
  // 作成に成功したら閉じる。失敗したらエラー文言を返す
  onCreate: (title: string) => Promise<string | null>;
};

export default function CreateContentDialog({ kind, open, place, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setError("");
      setSaving(false);
    }
  }, [open]);

  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed || saving) {
      return;
    }
    setSaving(true);
    const message = await onCreate(trimmed);
    if (message) {
      setError(message);
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={`新しい${kind.label}`}
      description={place ? `${kind.description}。「${place}」の中に作ります` : kind.description}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={!trimmed || saving} onClick={submit}>
            {saving ? "作成中..." : "作成"}
          </Button>
        </>
      }
    >
      <label className="mb-1.5 block text-sm font-medium" htmlFor="content-title">
        タイトル
      </label>
      <Input
        id="content-title"
        autoFocus
        value={title}
        maxLength={kind.createMaxLength}
        onChange={(e) => {
          setTitle(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={`${kind.label}のタイトル`}
        className="w-full"
      />
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-destructive">{error}</span>
        <span className="text-muted-foreground">
          {title.length} / {kind.createMaxLength}
        </span>
      </div>
    </Dialog>
  );
}
