import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useState } from "react";

import { changeWorkspace, inspectWorkspace } from "@/api/setup";
import Button from "@/components/common/Button";

type Props = {
  // 今の作業フォルダ（ダイアログの初期位置）
  current: string;
};

// 作業フォルダを選び直す。決めると config.toml に保存してアプリを再起動する
// （起動エラーの画面と設定画面で使う）
export default function WorkspacePicker({ current }: Props) {
  const [path, setPath] = useState("");
  const [hasAriDocs, setHasAriDocs] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "作業フォルダを選択",
      defaultPath: path || current || undefined,
    });
    if (typeof selected !== "string") {
      return;
    }
    setPath(selected);
    setError("");
    const info = await inspectWorkspace(selected);
    setHasAriDocs(info.hasAriDocs);
  };

  const change = async () => {
    setSaving(true);
    try {
      await changeWorkspace(path);
      // 成功するとアプリが再起動する
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mb-4 flex items-center gap-2">
        <div className="flex-1 truncate rounded-md border border-border bg-sidebar px-3 py-2 font-mono text-sm">
          {path || "未選択"}
        </div>
        <Button variant="secondary" onClick={selectFolder}>
          <FolderOpen size={16} />
          フォルダを選択
        </Button>
      </div>

      {path && (
        <div className="mb-5 rounded-md bg-sidebar p-3 text-sm text-foreground/80">
          {hasAriDocs ? (
            <p>
              このフォルダには ari-docs
              のデータがあります。そのデータを使って始めます。
            </p>
          ) : (
            <>
              <p className="mb-1">このフォルダの中に次のフォルダを作ります。</p>
              <ul className="list-disc pl-5 font-mono text-xs">
                <li>folder/（ファイルの置き場所）</li>
                <li>.ari-docs/（ari-docs のデータ）</li>
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={!path || saving} onClick={change}>
          {saving ? "再起動中..." : "このフォルダで再起動"}
        </Button>
      </div>
    </div>
  );
}
