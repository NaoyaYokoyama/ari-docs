import { Download, ExternalLink, Eye, X } from "lucide-react";

import IconButton from "@/components/common/IconButton";
import { fileKind, formatSize } from "@/lib/fileType";
import FilePreview from "@/pages/node/FilePreview";
import { SHORTCUT, shortcutLabel } from "@/shortcut/shortcut";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type Props = {
  // 選んでいるもの
  selected: Node[];
  onOpen: (node: Node) => void;
  onDownload: (node: Node) => void;
  onClose: () => void;
};

// Folder の一覧の右のプレビュー（FN0301-BR31。エクスプローラーのプレビュー ウィンドウと同じ）。選んだファイルの中身を出す
export default function PreviewPane({ selected, onOpen, onDownload, onClose }: Props) {
  const node = selected.length === 1 ? selected[0] : null;
  const file = node && node.nodeType !== NodeType.Folder ? node : null;
  const { icon: Icon, className } = fileKind(file?.name ?? "", false);

  return (
    <aside aria-label="プレビュー" className="hidden min-h-0 w-[38%] max-w-2xl min-w-72 shrink-0 flex-col border-l border-border lg:flex">
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2">
        {file ? (
          <>
            <Icon size={18} className={`mt-0.5 shrink-0 ${className}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatSize(file.size)}・{file.updatedAt}
              </p>
            </div>
            <IconButton label="ダウンロード" onClick={() => onDownload(file)}>
              <Download size={16} />
            </IconButton>
            <IconButton label="開く" onClick={() => onOpen(file)}>
              <ExternalLink size={16} />
            </IconButton>
          </>
        ) : (
          <p className="flex-1 py-1 text-sm font-medium text-muted-foreground">プレビュー</p>
        )}
        <IconButton label={`プレビューをしまう（${shortcutLabel(SHORTCUT.FOLDER_PREVIEW_PANE)}）`} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {file ? (
          <FilePreview key={file.path} node={file} fill />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Eye size={28} className="opacity-50" />
            {selected.length > 1
              ? `${selected.length} 件を選んでいます`
              : node
                ? "フォルダは中身を表示しません"
                : "ファイルを選ぶと、ここに中身を表示します"}
          </div>
        )}
      </div>
    </aside>
  );
}
