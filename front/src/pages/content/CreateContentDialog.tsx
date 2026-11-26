import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";
import type { ContentKind } from "@/pages/content/contentKinds";
import {
  builtinTemplates,
  type ContentTemplate,
  customTemplates,
  fillTemplate,
  TEMPLATE_FOLDER,
} from "@/pages/content/contentTemplates";

type Props = {
  kind: ContentKind;
  open: boolean;
  // 作る場所（フォルダの場所。空なら一番上。FN0403）
  place?: string;
  onClose: () => void;
  // 作成に成功したら閉じる。失敗したらエラー文言を返す
  // body はひな形の本文（なしなら空。FN0401-BR16）
  onCreate: (title: string, body: string) => Promise<string | null>;
};

export default function CreateContentDialog({ kind, open, place, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [template, setTemplate] = useState<ContentTemplate | null>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setError("");
      setSaving(false);
      setTemplate(null);
      setTemplates(builtinTemplates(kind));
      // 自分で足したひな形（「ひな形」フォルダ）は開くたびに読み直す
      customTemplates(kind)
        .then((custom) => setTemplates([...builtinTemplates(kind), ...custom]))
        .catch(console.error);
    }
  }, [open, kind]);

  // ひな形を選んだら、タイトルが空かひな形のタイトルのままなら入れ替える
  const choose = (next: ContentTemplate | null) => {
    const previous = template?.title ? fillTemplate(template.title).slice(0, kind.createMaxLength) : "";
    if (title.trim() === "" || title === previous) {
      setTitle(next?.title ? fillTemplate(next.title).slice(0, kind.createMaxLength) : "");
    }
    setTemplate(next);
  };

  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed || saving) {
      return;
    }
    setSaving(true);
    const message = await onCreate(trimmed, template ? fillTemplate(template.body) : "");
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
      <p className="mb-1.5 text-sm font-medium" id="content-template-label">
        ひな形
      </p>
      <div role="radiogroup" aria-labelledby="content-template-label" className="mb-1.5 flex flex-wrap gap-1.5">
        {[null, ...templates].map((item) => {
          const checked = (template?.id ?? null) === (item?.id ?? null);
          return (
            <button
              key={item?.id ?? "none"}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => choose(item)}
              className={twMerge(
                "rounded-full border px-3 py-1 text-sm transition outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                checked ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-accent",
              )}
            >
              {item ? item.name : "なし"}
            </button>
          );
        })}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {kind.label}の一番上の「{TEMPLATE_FOLDER}」フォルダに入れた{kind.label}もひな形になります。
        {"{{日付}}・{{曜日}}・{{時刻}}・{{今週}}"} は作るときに置き換えます
      </p>
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
