import { useState } from "react";

import SearchBar from "@/pages/home/SearchBar";
import FavoriteSidebar from "@/pages/home/FavoriteSidebar";
import SearchResult from "@/pages/home/SearchResult";
import Sidebar from "@/pages/home/Sidebar";
import type { SearchItem } from "@/types/searchItem";

function Home() {
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);

  return (
    <div className="flex h-full">
      <FavoriteSidebar />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl pt-2">
          <SearchBar onSearch={setSearchItems} />

          <SearchResult items={searchItems} />
        </div>
      </main>
    </div>
  );
}

export default Home;
