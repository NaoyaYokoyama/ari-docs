import { useState } from "react";

import { search } from "@/api/home";
import { useApp } from "@/app/AppContext";
import { type SearchType, setPreference, usePreferences } from "@/app/preferences";
import { useOpenAriLink } from "@/app/useAriLink";
import Kbd from "@/components/common/Kbd";
import { parseAriLink } from "@/lib/ariLink";
import FavoriteSidebar from "@/pages/home/FavoriteSidebar";
import RecentUpdates from "@/pages/home/RecentUpdates";
import SearchBar from "@/pages/home/SearchBar";
import SearchResult from "@/pages/home/SearchResult";
import SearchTypeFilter from "@/pages/home/SearchTypeFilter";
import { useNavigation } from "@/shortcut/useNavigation";
import type { SearchItem } from "@/types/searchItem";

// 画面の移動の数字はヘッダーに出ている画面の数（Docs を使う設定かで変わる）
const tips = (pages: number): { keys: string[]; label: string }[] => [
  { keys: ["Ctrl", "P"], label: "探して開く" },
  { keys: ["Alt", `1〜${pages}`], label: "画面の移動" },
  { keys: ["Ctrl", "N"], label: "新規作成" },
  { keys: ["Ctrl", "S"], label: "保存" },
  { keys: ["?"], label: "ショートカット一覧" },
];

function Home() {
  const { showMessage } = useApp();
  const navigation = useNavigation();
  const [result, setResult] = useState<{ keyword: string; items: SearchItem[] } | null>(null);
  const [searching, setSearching] = useState(false);

  // 探す種類（この PC に覚える。空ならすべて。FN0201-BR09）
  const { searchTypes } = usePreferences();

  const openAriLink = useOpenAriLink();

  const handleSearch = async (keyword: string, types: SearchType[] = searchTypes) => {
    // ari-docs の中のリンク（ari://…。FN0004）を貼って Enter なら、探さずにそこへ移る
    const link = parseAriLink(keyword);
    if (link) {
      openAriLink(link);
      return;
    }
    setSearching(true);
    try {
      const response = await search(keyword, types);
      setResult({ keyword, items: response.searchItems });
    } catch (error) {
      console.error(error);
      showMessage("error", "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex h-full">
      <FavoriteSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 pt-8 pb-12">
          {/* 挨拶などは出さず、検索欄を上に置く（ホームにはいろいろな情報を並べるため） */}
          {/* 検索欄・検索結果は読みやすい幅で中央に。最近更新されたものは広い幅を使う */}
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchBar
                searching={searching}
                onSearch={(keyword) => void handleSearch(keyword)}
                onClear={() => setResult(null)}
              />
            </div>
            <SearchTypeFilter
              value={searchTypes}
              onChange={(types) => {
                setPreference("searchTypes", types);
                // 検索した結果を出しているときは、選んだ種類で探し直す
                if (result) {
                  void handleSearch(result.keyword, types);
                }
              }}
            />
          </div>

          {result ? (
            <div className="mx-auto mt-8 max-w-2xl">
              <SearchResult keyword={result.keyword} items={result.items} />
            </div>
          ) : (
            <>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              {tips(navigation.length).map((tip) => (
                <li key={tip.label} className="flex items-center gap-1.5">
                  {tip.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                  <span className="ml-0.5">{tip.label}</span>
                </li>
              ))}
            </ul>
            <RecentUpdates />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default Home;
