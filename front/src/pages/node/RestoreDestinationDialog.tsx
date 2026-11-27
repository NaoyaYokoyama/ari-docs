import { ChevronRight, Folder, FolderRoot } from "lucide-react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

import { getNodes } from "@/api/node";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import type { Node } from "@/types/node";
import { NodeType } from "@/types/nodeType";

type Props = {
  // 元のフォルダが無いもの（元の場所の folder/ からのパス）。null なら閉じている
  missing: string[] | null;
  // 選んだものの数（元のフォルダがあるものは元の場所に戻す）
  total: number;
  onClose: () => void;
  // null は元のフォルダを作り直して戻す。文字は選んだフォルダ（folder/ からのパス。一番上は空）
  onChoose: (destination: string | null) => void;
};

function parentOf(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

// ゴミ箱から元に戻すとき、元のフォルダが無いものの戻す場所を選ぶ（FN0302-BR10）
export default function RestoreDestinationDialog({ missing, total, onClose, onChoose }: Props) {
  const [mode, setMode] = useState<"original" | "choose">("original");
  // 選んでいるフォルダ（folder/ からのパス）と、その中のフォルダ
  const [current, setCurrent] = useState("");
  const [folders, setFolders] = useState<Node[] | null>(null);

  useEffect(() => {
    if (missing) {
      setMode("original");
      setCurrent("");
    }
  }, [missing]);

  useEffect(() => {
    if (!missing || mode !== "choose") {
      return;
    }
    let alive = true;
    setFolders(null);
    getNodes(current)
      .then((response) => {
        if (alive) {
          setFolders(
            response.nodes
              .filter((node) => node.nodeType === NodeType.Folder)
              .sort((a, b) => a.name.localeCompare(b.name, "ja")),
          );
        }
      })
      .catch(() => alive && setFolders([]));
    return () => {
      alive = false;
    };
  }, [missing, mode, current]);

  const originals = [...new Set((missing ?? []).map(parentOf))];
  const crumbs = current ? current.split("/") : [];

  return (
    <Dialog
      open={!!missing}
      title="元のフォルダがありません"
      description={
        <>
          {total > (missing?.length ?? 0) ? `選んだ ${total} 件のうち ` : ""}
          {missing?.length ?? 0} 件は、元のフォルダが消えたか名前が変わっています。戻す場所を選んでください。
          {total > (missing?.length ?? 0) && "ほかは元の場所に戻します。"}
        </>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={() => onChoose(mode === "original" ? null : current)}>
            {mode === "original" ? "作り直して戻す" : `folder/${current} に戻す`}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="restore-destination"
            className="mt-1"
            checked={mode === "original"}
            onChange={() => setMode("original")}
          />
          <span>
            元のフォルダを作り直して戻す
            <span className="block text-xs break-all text-muted-foreground">
              {originals
                .slice(0, 3)
                .map((path) => `folder/${path}`)
                .join("、")}
              {originals.length > 3 && ` ほか ${originals.length - 3} か所`}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="restore-destination"
            className="mt-1"
            checked={mode === "choose"}
            onChange={() => setMode("choose")}
          />
          <span>ほかのフォルダを選んで戻す</span>
        </label>

        {mode === "choose" && (
          <div className="rounded-md border border-border">
            <nav aria-label="選んでいるフォルダ" className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5 text-xs">
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent"
                onClick={() => setCurrent("")}
              >
                <FolderRoot size={13} />
                folder
              </button>
              {crumbs.map((name, index) => (
                <span key={index} className="flex items-center gap-0.5">
                  <ChevronRight size={12} className="text-muted-foreground" />
                  <button
                    type="button"
                    className={twMerge(
                      "rounded px-1.5 py-0.5 hover:bg-accent",
                      index === crumbs.length - 1 && "font-medium",
                    )}
                    onClick={() => setCurrent(crumbs.slice(0, index + 1).join("/"))}
                  >
                    {name}
                  </button>
                </span>
              ))}
            </nav>
            <ul aria-label="中のフォルダ" className="max-h-60 overflow-y-auto p-1">
              {folders === null ? (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">読み込んでいます…</li>
              ) : folders.length === 0 ? (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">中にフォルダはありません</li>
              ) : (
                folders.map((folder) => (
                  <li key={folder.path}>
                    <button
                      type="button"
                      className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-accent"
                      onClick={() => setCurrent(folder.path)}
                    >
                      <Folder size={15} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{folder.name}</span>
                      <ChevronRight size={14} className="ml-auto shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
