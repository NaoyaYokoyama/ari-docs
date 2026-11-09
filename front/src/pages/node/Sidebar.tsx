import { ChevronDown, ChevronRight, Folder, FolderOpen, HardDrive, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { getNodes } from "@/api/node";
import PageSidebar from "@/components/common/PageSidebar";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type Props = {
  currentPath: string;
  onNavigate: (path: string) => void;
  // ゴミ箱を表示している
  trashOpen: boolean;
  onOpenTrash: () => void;
  // 作成・削除・アップロードのたびに増やし、ツリーを読み込み直す
  version: number;
};

type TreeProps = {
  path: string;
  depth: number;
  currentPath: string;
  onNavigate: (path: string) => void;
  version: number;
};

function Tree({ path, depth, currentPath, onNavigate, version }: TreeProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [openPaths, setOpenPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    getNodes(path)
      .then((response) =>
        setNodes(
          response.nodes
            .filter((node) => node.nodeType === NodeType.Folder)
            .sort((a, b) => a.name.localeCompare(b.name, "ja")),
        ),
      )
      .catch(() => setNodes([]));
  }, [path, version]);

  const toggle = (target: string) => {
    setOpenPaths((current) => {
      const next = new Set(current);
      if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      return next;
    });
  };

  return (
    <ul>
      {nodes.map((node) => {
        // 表示中のフォルダまでの道筋は開いておく
        const inPath = currentPath === node.path || currentPath.startsWith(`${node.path}/`);
        const open = openPaths.has(node.path) !== inPath;
        const selected = currentPath === node.path;
        const Icon = open ? FolderOpen : Folder;

        return (
          <li key={node.path}>
            <div
              // Vim モード（FN0702）: 行は j・k、l で開く、h で閉じる・上の階層へ
              data-vim-row
              className={twMerge(
                "group flex h-7 items-center rounded-md text-sm",
                selected ? "bg-accent font-medium" : "hover:bg-accent/60",
              )}
              style={{ paddingLeft: depth * 12 }}
            >
              <button
                type="button"
                aria-label={open ? "閉じる" : "開く"}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                onClick={() => toggle(node.path)}
                data-vim-toggle
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>

              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-2 text-left"
                onClick={() => onNavigate(node.path)}
                title={node.path}
                data-vim-item
                data-vim-depth={depth + 1}
                // 閉じているときは l でそのフォルダへ移る（移ると開く）ため、開いているときだけ付ける
                data-vim-expanded={open ? "true" : undefined}
                data-vim-selected={selected || undefined}
              >
                <Icon size={15} className={twMerge("shrink-0", selected ? "text-brand" : "text-muted-foreground")} />
                <span className="truncate">{node.name}</span>
              </button>
            </div>

            {open && (
              <Tree
                path={node.path}
                depth={depth + 1}
                currentPath={currentPath}
                onNavigate={onNavigate}
                version={version}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Sidebar({ currentPath, onNavigate, trashOpen, onOpenTrash, version }: Props) {
  // ゴミ箱を表示している間は、ツリーのフォルダを強調しない
  const shownPath = trashOpen ? null : currentPath;
  return (
    <PageSidebar title="フォルダ" className="w-72">
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <button
            type="button"
            onClick={() => onNavigate("")}
            data-vim-item
            data-vim-depth={0}
            data-vim-selected={shownPath === "" || undefined}
            className={twMerge(
              "mb-0.5 flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-sm",
              shownPath === "" ? "bg-accent font-medium" : "hover:bg-accent/60",
            )}
          >
            <HardDrive size={15} className={shownPath === "" ? "text-brand" : "text-muted-foreground"} />
            folder
          </button>
          <Tree path="" depth={0} currentPath={shownPath ?? "\u0000"} onNavigate={onNavigate} version={version} />
        </div>
        <button
          type="button"
          onClick={onOpenTrash}
          data-vim-item
          data-vim-depth={0}
          data-vim-selected={trashOpen || undefined}
          className={twMerge(
            "sticky bottom-0 mt-2 flex h-8 w-full shrink-0 items-center gap-1.5 rounded-md bg-sidebar px-1.5 text-left text-sm",
            trashOpen ? "bg-accent font-medium" : "hover:bg-accent/60",
          )}
        >
          <Trash2 size={15} className={trashOpen ? "text-brand" : "text-muted-foreground"} />
          ゴミ箱
        </button>
      </div>
    </PageSidebar>
  );
}

export default Sidebar;
