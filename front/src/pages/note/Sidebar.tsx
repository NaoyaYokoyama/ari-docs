import type { Note } from "@/types/note";

import { getNote } from "@/api/note";

type Props = {
  notes: Note[];
  onSelect: (noteId: string) => void;
};

export default function NoteSidebar({
  notes,
  onSelect,
}: Props) {
  return (

    <aside className="w-64 bg-slate-100 p-4">
      <div className="flex flex-col p-1">
        {notes.map((note) => (
          <button
            key={note.noteId}
            onClick={async () => {
              await getNote(note.noteId);
            }}
            className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-200"
          >
            <div className="truncate">
              {note.title}
            </div>

            <div className="text-xs text-slate-500">
              {note.updatedAt}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
