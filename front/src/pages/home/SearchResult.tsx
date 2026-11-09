import { BookOpen, FileText, Folder, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import EmptyState from "@/components/common/EmptyState";
import { splitPath, targetOf } from "@/pages/home/openTarget";
import type { SearchItem } from "@/types/searchItem";

type Props = {
  keyword: string;
  items: SearchItem[];
};

const GROUPS = [
  { viewType: "note", label: "Note" },
  { viewType: "wiki", label: "Wiki" },
  { viewType: "node", label: "ファイル・フォルダ" },
];

function iconOf(item: SearchItem) {
  if (item.viewType === "wiki") {
    return BookOpen;
  }
  if (item.viewType === "node" && item.nodeType === "folder") {
    return Folder;
  }
  return FileText;
}

// ノードの一番上のフォルダ（"a/b/c.txt" -> "a"、"c.txt" -> ""）
function topFolder(path: string) {
  const index = path.indexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function SearchResult({ keyword, items }: Props) {
  const navigate = useNavigate();
  // ファイル・フォルダを場所（一番上のフォルダ）で絞り込む（FN0201-BR08）。null はすべて
  const [place, setPlace] = useState<string | null>(null);
  const places = useMemo(
    () =>
      [...new Set(items.filter((item) => item.viewType === "node").map((item) => topFolder(item.name)))].sort(
        (a, b) => a.localeCompare(b, "ja"),
      ),
    [items],
  );
  const shown = items.filter(
    (item) => item.viewType !== "node" || place === null || topFolder(item.name) === place,
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={`「${keyword}」に一致するものはありません`}
        description="Note・Wiki はタイトルと本文、ファイル・フォルダは名前と中身（Excel・Word・PowerPoint・PDF・テキストなど）から探します。中身は数分前までに置いた・更新したファイルが対象です"
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        「{keyword}」の検索結果 {items.length} 件
      </p>

      {places.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="場所で絞り込み">
          <span className="text-muted-foreground">ファイルの場所:</span>
          {[null, ...places].map((value) => (
            <button
              key={value ?? "*"}
              type="button"
              aria-pressed={place === value}
              onClick={() => setPlace(value)}
              className={`rounded-full border px-2.5 py-0.5 ${
                place === value ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-accent"
              }`}
            >
              {value === null ? "すべて" : value === "" ? "folder 直下" : value}
            </button>
          ))}
        </div>
      )}

      {GROUPS.map((group) => {
        const groupItems = shown.filter((item) => item.viewType === group.viewType);
        if (groupItems.length === 0) {
          return null;
        }
        return (
          <section key={group.viewType}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
              {group.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.6875rem]">
                {groupItems.length}
              </span>
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {groupItems.map((item) => {
                const Icon = iconOf(item);
                const [name, parent] =
                  item.viewType === "node" ? splitPath(item.name) : [item.name, ""];
                const target = targetOf(item);
                return (
                  <li key={`${item.viewType}-${item.nodeId}-${item.noteId}-${item.wikiId}-${item.name}`}>
                    <button
                      type="button"
                      onClick={() => target && navigate(...target)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <Icon size={18} className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">{name}</span>
                          {item.matchType === "content" && (
                            <span className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[0.6875rem] text-brand">
                              中身に一致
                            </span>
                          )}
                        </span>
                        {parent && (
                          <span className="block truncate text-xs text-muted-foreground">
                            folder/{parent}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default SearchResult;
