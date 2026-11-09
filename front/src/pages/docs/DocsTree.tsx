import {
  ChevronDown,
  ChevronRight,
  FileText,
  LayoutList,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DocEntry } from "@/types/docs";

type TreeNode = {
  name: string;
  path: string;
  doc?: DocEntry;
  children: TreeNode[];
};

type Props = {
  docs: DocEntry[];
  warnings: Map<string, string[]>;
  selectedPath: string;
  onSelect: (path: string) => void;
};

function buildTree(docs: DocEntry[]) {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const doc of docs) {
    let current = root;
    const segments = doc.path.split("/");
    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join("/");
      let child = current.children.find((node) => node.name === segment);
      if (!child) {
        child = { name: segment, path, children: [] };
        current.children.push(child);
      }
      if (index === segments.length - 1) {
        child.doc = doc;
      }
      current = child;
    });
  }
  return root.children;
}

// 全角・半角と大文字・小文字を区別しないで比べるための正規化
function normalize(text: string) {
  return text.normalize("NFKC").toLowerCase();
}

// ファイル名・ID・名称に、空白で区切った語がすべて含まれるか
function matchDoc(doc: DocEntry, terms: string[]) {
  const target = normalize(
    `${doc.name} ${doc.frontMatter.id ?? ""} ${doc.frontMatter.title ?? ""}`,
  );
  return terms.every((term) => target.includes(term));
}

function DocsTree({ docs, warnings, selectedPath, onSelect }: Props) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const filtered =
    terms.length > 0 ? docs.filter((doc) => matchDoc(doc, terms)) : docs;

  // 入力中以外で "/" を押すと検索欄にフォーカスする
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.altKey &&
        !["INPUT", "TEXTAREA"].includes(target.tagName) &&
        !target.isContentEditable
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggle = (path: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const indent = { paddingLeft: `${depth * 12 + 8}px` };

    if (node.doc) {
      const count = warnings.get(node.path)?.length ?? 0;
      return (
        <button
          key={node.path}
          type="button"
          onClick={() => onSelect(node.path)}
          style={indent}
          title={node.path}
          data-vim-item
          data-vim-depth={depth}
          data-vim-selected={selectedPath === node.path || undefined}
          className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm ${
            selectedPath === node.path
              ? "bg-accent font-medium text-foreground"
              : "text-foreground/80 hover:bg-accent/60"
          }`}
        >
          <FileText size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name.replace(/\.md$/, "")}</span>
          {count > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-amber-700 dark:text-amber-300">
              <TriangleAlert size={12} />
              {count}
            </span>
          )}
        </button>
      );
    }

    // 検索中は該当するファイルが見えるよう、フォルダをすべて開く
    const isClosed = terms.length === 0 && closed.has(node.path);
    return (
      <div key={node.path}>
        <button
          type="button"
          onClick={() => toggle(node.path)}
          style={indent}
          data-vim-item
          data-vim-depth={depth}
          data-vim-expanded={String(!isClosed)}
          className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-sm font-medium text-foreground/80 hover:bg-accent/60"
        >
          {isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          <span className="truncate">{node.name}</span>
        </button>
        {!isClosed &&
          node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <aside
      className="w-72 shrink-0 overflow-y-auto border-r border-border bg-sidebar p-3"
      // Vim モードの領域の移動（<C-h>）で移る先。行は j・k、フォルダは l で開き h で閉じる（FN0702）
      data-vim-pane="sidebar"
    >
      <button
        type="button"
        onClick={() => onSelect("")}
        data-vim-item
        data-vim-depth={-1}
        data-vim-selected={selectedPath === "" || undefined}
        className={`mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
          selectedPath === ""
            ? "bg-accent font-medium text-foreground"
            : "text-foreground/80 hover:bg-accent/60"
        }`}
      >
        <LayoutList size={16} />
        一覧・チェック結果
      </button>

      <div className="relative mb-2">
        <Search
          size={14}
          className="absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter で先頭の結果を開く、Esc で検索をやめる
            if (e.key === "Enter" && filtered.length > 0) {
              e.preventDefault();
              onSelect(filtered[0].path);
            }
            if (e.key === "Escape") {
              setQuery("");
              e.currentTarget.blur();
            }
          }}
          // Vim モードの / で移る（FN0702）
          data-vim-filter
          placeholder="ファイル名・ID で検索（/）"
          className="w-full rounded-md border border-border bg-background py-1 pr-2 pl-7 text-sm outline-none focus:border-ring"
        />
      </div>
      {terms.length > 0 && (
        <p className="mb-1 px-2 text-xs text-muted-foreground">
          {filtered.length > 0 ? `${filtered.length} 件` : "該当なし"}
        </p>
      )}

      {buildTree(filtered).map((node) => renderNode(node, 0))}
    </aside>
  );
}

export default DocsTree;
