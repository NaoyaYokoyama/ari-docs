import { FilePlus, FolderPlus, PanelRight, RefreshCw, Search, Upload, X } from "lucide-react";
import type { RefObject } from "react";

import Breadcrumb from "@/components/common/Breadcrumb";
import Button from "@/components/common/Button";
import IconButton from "@/components/common/IconButton";
import Input from "@/components/common/Input";
import { canDropInto, draggedPaths, filesFromDrop, NODE_DRAG_TYPE } from "@/pages/node/nodeDrag";
import { pickedFiles } from "@/pages/node/useNodeUpload";
import { SHORTCUT, shortcutLabel } from "@/shortcut/shortcut";
import { NodeType } from "@/types/nodeType";
import type { UploadFile } from "@/types/uploadFile";

type Props = {
  currentPath: string;
  // 選んでいるもののパス（パンくずへのドラッグで、自分の中へ移そうとしていないかを確かめる）
  selected: Set<string>;
  loading: boolean;
  filter: string;
  onFilterChange: (filter: string) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  // アップロードの進み具合（0〜1）。null はアップロードしていない
  progress: number | null;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  // 「アップロード」を押したとき（ファイル・フォルダを選ぶメニューを開く）
  onUploadMenu: (position: { x: number; y: number }) => void;
  onUpload: (files: UploadFile[], destPath: string) => void;
  onTransfer: (paths: string[], destPath: string, copy: boolean) => void;
  onCreate: (type: NodeType) => void;
  // 右のプレビュー（FN0301-BR31）を出しているか
  previewOpen: boolean;
  onTogglePreview: () => void;
};

// フォルダ画面の上の帯（パンくず・絞り込み・再読み込み・アップロード・新規作成）
export default function NodeToolbar({
  currentPath,
  selected,
  loading,
  filter,
  onFilterChange,
  filterRef,
  fileInputRef,
  folderInputRef,
  progress,
  onNavigate,
  onRefresh,
  onUploadMenu,
  onUpload,
  onTransfer,
  onCreate,
  previewOpen,
  onTogglePreview,
}: Props) {
  return (
    // エクスプローラーと同じく、上の段に操作のボタン、下の段にパンくずと絞り込みを置く
    // （パンくずに横幅をすべて使わせ、深い階層でも名前が切れにくいように）
    <div className="shrink-0 border-b border-border">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 px-4 pt-2">
        <Button size="sm" onClick={() => onCreate(NodeType.File)}>
          <FilePlus size={15} />
          新しいファイル
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCreate(NodeType.Folder)}
          title={`新しいフォルダ（${shortcutLabel(SHORTCUT.CREATE)}）`}
        >
          <FolderPlus size={15} />
          新しいフォルダ
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={progress !== null}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onUploadMenu({ x: rect.left, y: rect.bottom + 4 });
          }}
          className="relative overflow-hidden"
        >
          {progress !== null && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-brand/20 transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          )}
          <Upload size={15} className="relative" />
          <span className="relative">
            {progress !== null ? `アップロード中 ${Math.round(progress * 100)}%` : "アップロード"}
          </span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = pickedFiles(e.target.files, false);
            e.target.value = "";
            if (files.length > 0) {
              onUpload(files, currentPath);
            }
          }}
        />
        <input
          ref={(element) => {
            folderInputRef.current = element;
            // フォルダを選ぶ（React の型に無い属性のため、ここで付ける）
            element?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = pickedFiles(e.target.files, true);
            e.target.value = "";
            if (files.length > 0) {
              onUpload(files, currentPath);
            }
          }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <Breadcrumb
            path={currentPath}
            onNavigate={onNavigate}
            canDrop={(target, event) =>
              event.dataTransfer.types.includes(NODE_DRAG_TYPE)
                ? target !== currentPath && canDropInto([...selected], target)
                : event.dataTransfer.types.includes("Files")
            }
            onDrop={(target, event) => {
              if (event.dataTransfer.types.includes(NODE_DRAG_TYPE)) {
                const paths = draggedPaths(event.dataTransfer);
                if (paths.length > 0 && target !== currentPath && canDropInto(paths, target)) {
                  onTransfer(paths, target, event.ctrlKey || event.altKey);
                }
                return;
              }
              void filesFromDrop(event.dataTransfer).then((files) => {
                if (files.length > 0) {
                  onUpload(files, target);
                }
              });
            }}
          />
        </div>
        <IconButton label="再読み込み" onClick={onRefresh}>
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
        </IconButton>
        {/* 画面が狭いときは右のプレビューを出さないので、ボタンも出さない */}
        <IconButton
          label={`${previewOpen ? "プレビューをしまう" : "右にプレビューを出す"}（${shortcutLabel(SHORTCUT.FOLDER_PREVIEW_PANE)}）`}
          active={previewOpen}
          onClick={onTogglePreview}
          className="hidden lg:flex"
        >
          <PanelRight size={16} />
        </IconButton>
        <div className="relative shrink-0">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={filterRef}
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onFilterChange("");
                e.currentTarget.blur();
              }
            }}
            // Vim モードの / で移る（FN0702）
            data-vim-filter
            placeholder="このフォルダ内を絞り込み"
            aria-label="このフォルダ内を絞り込み"
            title={`このフォルダ内を名前で絞り込み（${shortcutLabel(SHORTCUT.FOLDER_FILTER)}）`}
            className="h-8 w-60 pr-7 pl-8 text-sm"
          />
          {filter && (
            <button
              type="button"
              aria-label="絞り込みを消す"
              onClick={() => onFilterChange("")}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
