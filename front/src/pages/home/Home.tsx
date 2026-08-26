import { useState } from "react";

import SearchBar from "@/pages/home/SearchBar";
import SearchResult from "@/pages/home/SearchResult";
import type { SearchItem } from "@/types/searchItem";

function Home() {
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl pt-24">
        <SearchBar onSearch={setSearchItems} />

        <SearchResult items={searchItems} />
      </div>
    </main>
  );
}

export default Home;
