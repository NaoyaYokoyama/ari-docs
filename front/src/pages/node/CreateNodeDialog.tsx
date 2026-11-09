import { FileText, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { createNode } from "@/api/node";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import Input from "@/components/common/Input";
import { errorMessage } from "@/lib/format";
import { NodeType } from "@/types/nodeType";

type Props = {
  open: boolean;
  defaultType: NodeType;
  currentPath: string;
  onClose: () => void;
  onCreated: (name: string) => void;
};

const TYPES = [
  { value: NodeType.Folder, label: "フォルダ", icon: Folder },
  { value: NodeType.File, label: "ファイル", icon: FileText },
];

// サーバーと同じ規則（back の service/node.rs の validate_name）。先に画面で知らせる
function validate(name: string) {
  if (!name.trim()) {
    return "";
  }
  if (name === "." || name === "..") {
    return "この名前は使えません";
  }
  if (/[/\\:*?"<>|]/.test(name)) {
    return '名前に / \\ : * ? " < > | は使えません';
  }
  return "";
}

function CreateNodeDialog({ open, defaultType, currentPath, onClose, onCreated }: Props) {
  const { showMessage } = useApp();
  const [nodeType, setNodeType] = useState<NodeType>(defaultType);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNodeType(defaultType);
      setName("");
      setError("");
      setSaving(false);
    }
  }, [open, defaultType]);

  const invalid = validate(name);
  const canSubmit = name.trim() !== "" && !invalid && !saving;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    setSaving(true);
    try {
      await createNode(currentPath, nodeType, name);
      showMessage("info", `「${name}」を作成しました`);
      onCreated(name);
    } catch (e) {
      setError(errorMessage(e, "作成に失敗しました"));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="新規作成"
      description={`作成先: folder/${currentPath}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {saving ? "作成中..." : "作成"}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="種類" className="mb-4 grid grid-cols-2 gap-2">
        {TYPES.map((type) => {
          const Icon = type.icon;
          const checked = nodeType === type.value;
          return (
            <button
              key={type.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setNodeType(type.value)}
              className={twMerge(
                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                checked
                  ? "border-brand bg-brand/5 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              <Icon size={16} className={checked ? "text-brand" : undefined} />
              {type.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="node-name" className="mb-1.5 block text-sm font-medium">
        名前
      </label>
      <Input
        id="node-name"
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={nodeType === NodeType.Folder ? "例: 議事録" : "例: memo.txt"}
        className="w-full"
      />
      <p className="mt-1.5 min-h-4 text-xs text-destructive">{invalid || error}</p>
    </Dialog>
  );
}

export default CreateNodeDialog;
