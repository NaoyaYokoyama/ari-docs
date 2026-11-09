import { Copy, Replace } from "lucide-react";

import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";

export type ConflictChoice = "replace" | "keepBoth" | "cancel";

type Props = {
  // 同じ名前があった項目の名前。null なら閉じている
  names: string[] | null;
  onChoose: (choice: ConflictChoice) => void;
};

// アップロード先に同じ名前のファイル・フォルダがあるときの確認（FN0301-BR23）
export default function UploadConflictDialog({ names, onChoose }: Props) {
  if (!names) {
    return null;
  }
  const shown = names.slice(0, 5);
  return (
    <Dialog
      open
      title="同じ名前の項目があります"
      description={`アップロード先に、同じ名前のファイル・フォルダが ${names.length} 件あります。どうしますか？`}
      onClose={() => onChoose("cancel")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onChoose("cancel")} className="mr-auto">
            キャンセル
          </Button>
          <Button variant="secondary" onClick={() => onChoose("keepBoth")}>
            <Copy size={16} />
            両方残す
          </Button>
          <Button autoFocus onClick={() => onChoose("replace")}>
            <Replace size={16} />
            置き換える
          </Button>
        </>
      }
    >
      <ul className="space-y-1 text-sm">
        {shown.map((name) => (
          <li key={name} className="truncate rounded bg-muted px-2 py-1 font-mono text-[0.8125rem]">
            {name}
          </li>
        ))}
        {names.length > shown.length && (
          <li className="text-xs text-muted-foreground">ほか {names.length - shown.length} 件</li>
        )}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        「置き換える」はファイルを上書きします（フォルダは中身をまとめ、同じ名前のファイルを上書きします）。「両方残す」はアップロードする方の名前に (2) などを付けます。
      </p>
    </Dialog>
  );
}
