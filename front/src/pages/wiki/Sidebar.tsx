import {
  forwardRef,
  useState,
} from "react";

import type { Wiki } from "@/types/wiki";

type Props = {
  wikis: Wiki[];
  onSelect: (wikiId: string) => void;
};

const WikiSidebar = forwardRef<
  HTMLElement,
  Props
>(({ wikis, onSelect }, ref) => {
  const [focusedIndex, setFocusedIndex] =
    useState(0);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
  ) => {
    if (wikis.length === 0) {
      return;
    }

    // 次のWiki
    if (
      e.key === "j" ||
      e.key === "ArrowDown"
    ) {
      e.preventDefault();

      setFocusedIndex((index) =>
        Math.min(
          index + 1,
          wikis.length - 1,
        ),
      );

      return;
    }

    // 前のWiki
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

    // Wiki選択
    if (e.key === "Enter") {
      e.preventDefault();

      const wiki = wikis[focusedIndex];

      if (wiki) {
        onSelect(wiki.wikiId);
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
        {wikis.map((wiki, index) => (
          <button
            key={wiki.wikiId}
            tabIndex={-1}
            onClick={() => {
              setFocusedIndex(index);
              onSelect(wiki.wikiId);
            }}
            className={
              "w-full rounded-md px-3 py-2 text-left " +
              (index === focusedIndex
                ? "bg-slate-200"
                : "hover:bg-slate-200")
            }
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
});

WikiSidebar.displayName = "WikiSidebar";

export default WikiSidebar;
