import { LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

type Props = {
  searching: boolean;
  onSearch: (keyword: string) => void;
  onClear: () => void;
};

function SearchBar({ searching, onSearch, onClear }: Props) {
  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [keyword, setKeyword] = useState("");

  // Alt+1 で来たとき・初めて開いたときは検索欄にフォーカスする
  useEffect(() => {
    searchRef.current?.focus();
  }, [location.key]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setKeyword("");
      onClear();
      return;
    }
    // 変換を確定する Enter では検索しない（FN0201-BR04）
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    const trimmed = keyword.trim();
    if (trimmed) {
      onSearch(trimmed);
    }
  };

  return (
    <div className="relative w-full">
      <Search
        size={18}
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
      />

      <input
        ref={searchRef}
        type="text"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        onKeyDown={handleKeyDown}
        // Vim モードの / で移る（FN0702）
        data-vim-filter
        placeholder="ファイル、Wiki、Noteを検索（Enter）"
        className="h-12 w-full rounded-full border border-input bg-background pr-12 pl-11 text-base shadow-sm transition outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/20"
      />

      <div className="absolute top-1/2 right-3 -translate-y-1/2">
        {searching ? (
          <LoaderCircle size={18} className="animate-spin text-muted-foreground" />
        ) : (
          keyword && (
            <button
              type="button"
              aria-label="クリア"
              title="クリア（Esc）"
              onClick={() => {
                setKeyword("");
                onClear();
                searchRef.current?.focus();
              }}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <X size={16} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default SearchBar;
