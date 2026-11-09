import { FolderOpen, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getDocs } from "@/api/docs";
import { buildIdIndex, checkDocs } from "@/pages/docs/checkDocs";
import DocsTree from "@/pages/docs/DocsTree";
import DocViewer from "@/pages/docs/DocViewer";
import type { DocEntry } from "@/types/docs";

function Docs() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [resolvedRoot, setResolvedRoot] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  // root: 表示するフォルダ（空ならリポジトリの docs/）、path: root からの相対パス
  const root = searchParams.get("root") ?? "";
  const selectedPath = searchParams.get("path") ?? "";
  const [rootInput, setRootInput] = useState(root);

  useEffect(() => {
    setError("");
    getDocs(root)
      .then((response) => {
        setDocs(response.docs);
        setResolvedRoot(response.root);
        setNotice(response.notice);
        setRootInput(root || response.root);
      })
      .catch((e) => {
        console.error(e);
        setDocs([]);
        setResolvedRoot("");
        setNotice("");
        setError(
          "フォルダを読み込めませんでした。パスを確認してください（任意のフォルダの指定はローカルモードのみ）",
        );
      });
  }, [root]);

  const warnings = useMemo(() => checkDocs(docs), [docs]);
  const idIndex = useMemo(() => buildIdIndex(docs), [docs]);
  const selectedDoc = docs.find((doc) => doc.path === selectedPath);
  const warningTotal = [...warnings.values()].reduce(
    (sum, list) => sum + list.length,
    0,
  );

  const select = (path: string) => {
    const params: Record<string, string> = {};
    if (root) {
      params.root = root;
    }
    if (path) {
      params.path = path;
    }
    setSearchParams(params);
  };

  const openRoot = (event: React.FormEvent) => {
    event.preventDefault();
    const next = rootInput.trim();
    // 表示中のフォルダと同じなら何もしない。空欄ならリポジトリの docs/ に戻す
    if (next === resolvedRoot) {
      return;
    }
    setSearchParams(next ? { root: next } : {});
  };

  return (
    <div className="flex h-full flex-col">
      <form
        onSubmit={openRoot}
        className="flex items-center gap-2 border-b border-border bg-background px-3 py-2"
      >
        <FolderOpen size={16} className="shrink-0 text-muted-foreground" />
        <input
          value={rootInput}
          onChange={(e) => setRootInput(e.target.value)}
          placeholder="表示するフォルダのパス（空欄で「表示」なら初期フォルダ）"
          className="flex-1 rounded-md border border-border px-2 py-1 text-sm outline-none focus:border-ring"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/85"
        >
          表示
        </button>
        <button
          type="button"
          onClick={() => navigate("/setting", { state: { section: "docs" } })}
          className="text-xs whitespace-nowrap text-muted-foreground underline hover:text-foreground"
        >
          初期フォルダを変更
        </button>
      </form>

      <div className="flex min-h-0 flex-1">
        <DocsTree
          docs={docs}
          warnings={warnings}
          selectedPath={selectedPath}
          onSelect={select}
        />

        <main className="flex-1 overflow-y-auto">
          {notice && (
            <p className="mx-8 mt-4 rounded-md border border-warning/50 bg-warning/10 p-2 text-sm text-amber-700 dark:text-amber-300">
              {notice}
            </p>
          )}
          {error && <p className="p-6 text-sm text-destructive">{error}</p>}

          {selectedDoc ? (
            <DocViewer
              key={selectedDoc.path}
              root={root}
              doc={selectedDoc}
              warnings={warnings.get(selectedDoc.path) ?? []}
              idIndex={idIndex}
              onSelect={select}
            />
          ) : (
            <div className="px-8 py-6">
              <h1 className="mb-1 text-xl font-semibold">Markdown ビューア</h1>
              <p className="mb-4 text-sm text-muted-foreground">
                {resolvedRoot} ／ {docs.length} 件 ／ 警告 {warningTotal} 件
              </p>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">ID</th>
                    <th className="py-2 pr-4 font-medium">名称</th>
                    <th className="py-2 pr-4 font-medium">種類</th>
                    <th className="py-2 pr-4 font-medium">状態</th>
                    <th className="py-2 pr-4 font-medium">更新日</th>
                    <th className="py-2 font-medium">警告</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const list = warnings.get(doc.path) ?? [];
                    return (
                      <tr
                        key={doc.path}
                        onClick={() => select(doc.path)}
                        className="cursor-pointer border-b border-border align-top hover:bg-accent"
                      >
                        <td className="py-2 pr-4 font-mono text-xs">
                          {doc.frontMatter.id ?? "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {doc.frontMatter.title ?? doc.name}
                          <div className="text-xs text-muted-foreground">
                            {doc.path}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          {doc.frontMatter.type ?? "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {doc.frontMatter.status ?? "-"}
                        </td>
                        <td className="py-2 pr-4">
                          {doc.frontMatter.updated ?? "-"}
                        </td>
                        <td className="py-2 text-xs text-amber-700 dark:text-amber-300">
                          {list.map((warning) => (
                            <p key={warning} className="flex items-start gap-1">
                              <TriangleAlert
                                size={12}
                                className="mt-0.5 shrink-0"
                              />
                              {warning}
                            </p>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Docs;
