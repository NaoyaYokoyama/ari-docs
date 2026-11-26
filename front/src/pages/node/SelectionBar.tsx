import { Copy, FileArchive, Scissors, Trash2 } from "lucide-react";

import Button from "@/components/common/Button";

type Props = {
  count: number;
  onCut: () => void;
  onCopy: () => void;
  onZip: () => void;
  onRemove: () => void;
  onClear: () => void;
};

// 2 件以上選んだときの帯（FN0301-BR05）。選んでいないときも同じ高さで出し、まとめて選ぶ方法を書いておく
// （選び始めたときに一覧が下へずれて、囲んでいる行がずれないように）
export default function SelectionBar({ count, onCut, onCopy, onZip, onRemove, onClear }: Props) {
  if (count < 2) {
    return (
      <div className="flex h-9 shrink-0 items-center border-b border-border px-4 text-xs text-muted-foreground">
        <span className="truncate">
          チェックボックス・Ctrl／Shift＋クリック・空いているところからドラッグで囲む、でまとめて選べます
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-4 text-xs">
      <span className="font-medium">{count} 件を選択中</span>
      <Button variant="ghost" size="sm" onClick={onCut}>
        <Scissors size={14} />
        切り取り
      </Button>
      <Button variant="ghost" size="sm" onClick={onCopy}>
        <Copy size={14} />
        コピー
      </Button>
      <Button variant="ghost" size="sm" onClick={onZip}>
        <FileArchive size={14} />
        ZIP でダウンロード
      </Button>
      <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:bg-destructive/10">
        <Trash2 size={14} />
        ゴミ箱に移動
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto">
        選択を外す
      </Button>
    </div>
  );
}
