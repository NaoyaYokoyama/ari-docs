import { Search } from "lucide-react";
import { search } from "@/api/home";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";

import type { SearchItem } from "@/types/searchItem";

type Props = {
  onSearch: (items: SearchItem[]) => void;
};

function SearchBar({
  onSearch,
}: Props) {

  const location = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (location.state?.focus === "search") {
      searchRef.current?.focus();
    }
  }, []);

  const handleSearch = async (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    const response = await search(keyword);

    onSearch(response.searchItems);
  };

  return (
    <div className="relative w-full max-w-2xl">
      <Search
        size={20}
        className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
      />

      <input
        ref={searchRef }
        type="text"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        onKeyDown={handleSearch}
        placeholder="ファイル、Wiki、個人メモを検索"
        className="w-full rounded-full border border-slate-300 bg-white py-3 pr-4 pl-12 text-base transition outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
      />
    </div>
  );
}

export default SearchBar;
