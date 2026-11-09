import { Download, ExternalLink } from "lucide-react";

import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import { fileKind, formatSize } from "@/lib/fileType";
import FilePreview from "@/pages/node/FilePreview";
import type { Node } from "@/types/node";

type Props = {
  // プレビューするファイル。null なら閉じている
  node: Node | null;
  onClose: () => void;
  onOpen: (node: Node) => void;
  onDownload: (node: Node) => void;
};

// ファイルのプレビュー（FN0301-BR30。Space）。画像・PDF・テキスト・Markdown・CSV をアプリの中で見る
export default function PreviewDialog({ node, onClose, onOpen, onDownload }: Props) {
  if (!node) {
    return null;
  }
  const { icon: Icon, className } = fileKind(node.name, false);
  return (
    <Dialog
      open
      title={
        <span className="flex items-center gap-2">
          <Icon size={18} className={className} />
          <span className="truncate">{node.name}</span>
        </span>
      }
      description={`${formatSize(node.size)}・${node.updatedAt}`}
      onClose={onClose}
      className="max-w-4xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => onDownload(node)}>
            <Download size={16} />
            ダウンロード
          </Button>
          <Button
            onClick={() => {
              onClose();
              onOpen(node);
            }}
          >
            <ExternalLink size={16} />
            開く
          </Button>
        </>
      }
    >
      <FilePreview node={node} />
    </Dialog>
  );
}
