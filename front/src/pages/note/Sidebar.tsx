import {
  forwardRef,
  useState,
} from "react";

import type { Note } from "@/types/note";

type Props = {
  notes: Note[];
  onSelect: (noteId: string) => void;
};

const NoteSidebar = forwardRef<
  HTMLElement,
  Props
>(({ notes, onSelect }, ref) => {
  const [focusedIndex, setFocusedIndex] =
    useState(0);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
  ) => {
    if (notes.length === 0) {
      return;
    }

    // 次のNote
    if (
      e.key === "j" ||
      e.key === "ArrowDown"
    ) {
      e.preventDefault();

      setFocusedIndex((index) =>
        Math.min(
          index + 1,
          notes.length - 1,
        ),
      );

      return;
    }

    // 前のNote
    if (
      e.key === "k" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();

      setFocusedIndex((index) =>
        Math.max(index - 1, 0),
      );

      return;
    }

    // Note選択
    if (e.key === "Enter") {
      e.preventDefault();

      const note = notes[focusedIndex];

      if (note) {
        onSelect(note.noteId);
      }
    }
  };

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="w-64 bg-slate-100 p-4 outline-none"
    >
      <div className="flex flex-col p-1">
        {notes.map((note, index) => (
          <button
            key={note.noteId}
            tabIndex={-1}
            onClick={() => {
              setFocusedIndex(index);
              onSelect(note.noteId);
            }}
            className={
              "w-full rounded-md px-3 py-2 text-left " +
              (index === focusedIndex
                ? "bg-slate-200"
                : "hover:bg-slate-200")
            }
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
});

NoteSidebar.displayName = "NoteSidebar";

export default NoteSidebar;
