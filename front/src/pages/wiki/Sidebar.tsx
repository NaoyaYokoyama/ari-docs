import type { Note } from "@/types/note";

type Props = {
  wikis: Wiki[];
  onSelect: (wikiId: string) => void;
};

export default function WikiSidebar({
  wikis,
  onSelect,
}: Props) {
  return (

    <aside className="w-64 bg-slate-100 p-4">
      <div className="flex flex-col p-1">
        {wikis.map((wiki) => (
          <button
            key={wiki.wikiId}
            onClick={async () => {
              onSelect(wiki.wikiId);
            }}
            className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-200"
          >
            <div className="truncate">
              {wiki.title}
            </div>

            <div className="text-xs text-slate-500">
              {wiki.updatedAt}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
