import { useState } from "react";

import { search } from "@/api/home";
import { useApp } from "@/app/AppContext";
import { type SearchType, setPreference, usePreferences } from "@/app/preferences";
import { useOpenAriLink } from "@/app/useAriLink";
import Kbd from "@/components/common/Kbd";
import { parseAriLink } from "@/lib/ariLink";
import FavoriteSidebar from "@/pages/home/FavoriteSidebar";
import HomeTasks from "@/pages/home/HomeTasks";
import RecentUpdates from "@/pages/home/RecentUpdates";
import SearchBar from "@/pages/home/SearchBar";
import SearchPeriodFilter, { NO_PERIOD, periodLabel, periodRange, type SearchPeriod } from "@/pages/home/SearchPeriodFilter";
import SearchResult from "@/pages/home/SearchResult";
import SearchTypeFilter from "@/pages/home/SearchTypeFilter";
import { useNavigation } from "@/shortcut/useNavigation";
import type { SearchItem } from "@/types/searchItem";

// 画面の移動の数字はヘッダーに出ている画面の数（Docs を使う設定かで変わる）
const tips = (pages: number): { keys: string[]; label: string }[] => [
  { keys: ["Ctrl", "P"], label: "探して開く" },
  { keys: ["Alt", `1〜${pages}`], label: "画面の移動" },
  { keys: ["?"], label: "ショートカット一覧" },
];

function Home() {
  const { showMessage } = useApp();
  const navigation = useNavigation();
  const [result, setResult] = useState<{ keyword: string; period: string; items: SearchItem[] } | null>(null);
  // 更新日の期間（覚えない。FN0201-BR11）
  const [period, setPeriod] = useState<SearchPeriod>(NO_PERIOD);
  const [searching, setSearching] = useState(false);

  // 探す種類（この PC に覚える。空ならすべて。FN0201-BR09）
  const { searchTypes, searchNameOnly } = usePreferences();

  const openAriLink = useOpenAriLink();

  const handleSearch = async (
    keyword: string,
    types: SearchType[] = searchTypes,
    nameOnly: boolean = searchNameOnly,
    searchPeriod: SearchPeriod = period,
  ) => {
    // ari-docs の中のリンク（ari://…。FN0004）を貼って Enter なら、探さずにそこへ移る
    const link = keyword ? parseAriLink(keyword) : null;
    if (link) {
      openAriLink(link);
      return;
    }
    setSearching(true);
    try {
      const response = await search(keyword, types, nameOnly, periodRange(searchPeriod));
      setResult({
        keyword,
        period: searchPeriod.preset ? periodLabel(searchPeriod) : "",
        items: response.searchItems,
      });
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
                nameOnly={searchNameOnly}
                allowEmpty={period.preset !== ""}
                onSearch={(keyword) => void handleSearch(keyword)}
                onClear={() => setResult(null)}
              />
            </div>
            <SearchPeriodFilter
              value={period}
              onChange={(next) => {
                setPeriod(next);
                // 結果を出しているとき・期間だけで探すときは、選んだ期間で探し直す
                if (result) {
                  if (result.keyword || next.preset) {
                    void handleSearch(result.keyword, searchTypes, searchNameOnly, next);
                  } else {
                    setResult(null);
                  }
                } else if (next.preset) {
                  void handleSearch("", searchTypes, searchNameOnly, next);
                }
              }}
            />
            <SearchTypeFilter
              value={searchTypes}
              nameOnly={searchNameOnly}
              onChange={(types) => {
                setPreference("searchTypes", types);
                // 検索した結果を出しているときは、選んだ種類で探し直す
                if (result) {
                  void handleSearch(result.keyword, types);
                }
              }}
              onNameOnlyChange={(nameOnly) => {
                setPreference("searchNameOnly", nameOnly);
                if (result) {
                  void handleSearch(result.keyword, searchTypes, nameOnly);
                }
              }}
            />
          </div>

          {result ? (
            <div className="mx-auto mt-8 max-w-2xl">
              <SearchResult keyword={result.keyword} period={result.period} items={result.items} />
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
            <HomeTasks />
            <RecentUpdates />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default Home;
