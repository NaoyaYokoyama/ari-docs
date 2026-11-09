import { BookOpen, Clock, FileText } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { type NavigateOptions, useNavigate } from "react-router-dom";
import { twMerge } from "tailwind-merge";

import { getRecent, type RecentResponse } from "@/api/home";
import { fileKind } from "@/lib/fileType";
import { formatRelative } from "@/lib/format";
import { splitPath } from "@/pages/home/openTarget";

type Row = {
  key: string;
  icon: ReactNode;
  title: string;
  sub: string;
  time: string;
  to: [string, NavigateOptions];
};

// ホームの「最近更新されたもの」（FN0201-BR07）。共有モードでほかの人の変更に気づけるようにする
export default function RecentUpdates() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentResponse | null>(null);

  useEffect(() => {
    getRecent().then(setRecent).catch(console.error);
  }, []);

  if (!recent) {
    return null;
  }

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "Wiki",
      rows: recent.wikis.map((wiki): Row => ({
        key: wiki.id,
        icon: <BookOpen size={16} className="text-brand" />,
        title: wiki.title,
        sub: wiki.updatedBy,
        time: formatRelative(wiki.updatedAt),
        to: ["/wiki", { state: { wikiId: wiki.id } }],
      })),
    },
    {
      title: "ファイル",
      rows: recent.files.map((file): Row => {
        const [name, parent] = splitPath(file.path);
        const { icon: Icon, className } = fileKind(name, false);
        return {
          key: file.path,
          icon: <Icon size={16} className={className} />,
          title: name,
          sub: `folder/${parent}`,
          time: formatRelative(file.updatedAt),
          to: ["/folder", { state: { nodePath: file.path } }],
        };
      }),
    },
    {
      title: "自分の Note",
      rows: recent.notes.map((note): Row => ({
        key: note.id,
        icon: <FileText size={16} className="text-muted-foreground" />,
        title: note.title,
        sub: "",
        time: formatRelative(note.updatedAt),
        to: ["/note", { state: { noteId: note.id } }],
      })),
    },
  ].filter((group) => group.rows.length > 0);

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="@container mt-10">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
        <Clock size={14} />
        最近更新されたもの
      </h2>
      {/* 列の数は置き場所の幅で決める（ノート PC でも 3 列。文字を大きくしたときは自然に減る） */}
      <div
        className={twMerge(
          "grid gap-4",
          groups.length > 1 && "@xl:grid-cols-2",
          groups.length > 2 && "@3xl:grid-cols-3",
        )}
      >
        {groups.map((group) => (
          <div key={group.title} className="overflow-hidden rounded-lg border border-border bg-card">
            <h3 className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {group.title}
            </h3>
            <ul>
              {group.rows.map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => navigate(...row.to)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span className="shrink-0">{row.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{row.title}</span>
                      {row.sub && (
                        <span className="block truncate text-xs text-muted-foreground">{row.sub}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{row.time}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
