import { Folder, FolderRoot } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import { folderOptions, type Tree } from "@/pages/content/contentTree";

type Props = {
  tree: Tree;
  // 移すもの。null なら閉じている
  target: { label: string; folderIds: string[]; itemIds: string[]; currentFolderId: string } | null;
  onClose: () => void;
  onMove: (destId: string) => void;
};

// 移動先のフォルダを選ぶ（ドラッグできないとき・キーボードで操作するとき。FN0403-BR06）
export default function MoveDialog({ tree, target, onClose, onMove }: Props) {
  const [dest, setDest] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // 開いたら一覧を ↑↓ で選べるようにする（div は autoFocus では選ばれないため）
  useEffect(() => {
    if (target) {
      setDest(target.currentFolderId);
      requestAnimationFrame(() => listRef.current?.focus());
    }
  }, [target]);

  const options = [
    { folderId: "", name: "一番上", depth: 0 },
    ...folderOptions(tree, target?.folderIds ?? []).map((option) => ({
      ...option,
      depth: option.depth + 1,
    })),
  ];
  const unchanged = dest === target?.currentFolderId;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const index = options.findIndex((option) => option.folderId === dest);
    const step = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
    if (step) {
      e.preventDefault();
      const next = options[Math.min(Math.max(index + step, 0), options.length - 1)];
      setDest(next.folderId);
      document.getElementById(`move-dest-${next.folderId || "root"}`)?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && !unchanged) {
      e.preventDefault();
      onMove(dest);
    }
  };

  return (
    <Dialog
      open={!!target}
      title={`「${target?.label ?? ""}」の移動先`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={unchanged} onClick={() => onMove(dest)}>
            移動
          </Button>
        </>
      }
    >
      <div
        role="listbox"
        aria-label="移動先のフォルダ"
        ref={listRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="max-h-80 overflow-y-auto rounded-md border border-border p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {options.map((option) => {
          const Icon = option.folderId ? Folder : FolderRoot;
          const selected = option.folderId === dest;
          return (
            <button
              key={option.folderId || "root"}
              id={`move-dest-${option.folderId || "root"}`}
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onClick={() => setDest(option.folderId)}
              onDoubleClick={() => option.folderId !== target?.currentFolderId && onMove(option.folderId)}
              style={{ paddingLeft: `${0.5 + option.depth * 1}rem` }}
              className={twMerge(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                selected ? "bg-accent font-medium" : "hover:bg-accent/60",
              )}
            >
              <Icon size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{option.name}</span>
              {option.folderId === target?.currentFolderId && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">今の場所</span>
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
