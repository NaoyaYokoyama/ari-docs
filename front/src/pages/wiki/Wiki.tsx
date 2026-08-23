import { useEffect, useState } from "react";
import { FilePlus, Save } from "lucide-react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Sidebar from "@/pages/wiki/Sidebar";

import { getWikis, getWiki, createWiki, updateWiki, deleteWiki } from "@/api/wiki";
import type { Wiki as WikiType } from "@/types/wiki";

export default function Wiki() {
  const [wikis, setWikis] = useState<WikiType[]>([]);
  const [wikiName, setWikiName] = useState("");
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [selectedWiki, setSelectedWiki] = useState<WikiDetail | null>(null);

  const handleSelect = async (wikiId: string) => {
    try {
      const wiki = await getWiki(wikiId);
      setSelectedWiki(wiki);
    } catch (error) {
      console.error("Wikiの取得に失敗しました", error);
    }
  };

  const loadWikis = async () => {
    try {
      const response = await getWikis();
      setWikis(response.wikis);
    } catch (error) {
      console.error("Wiki一覧の取得に失敗しました", error);
    }
  };

  useEffect(() => {
    loadWikis();
  }, []);

  const apiCreateWiki = async () => {
    const trimmedName = wikiName.trim();
    if (!trimmedName) {
      return;
    }
    const response = await createWiki(trimmedName);
    setWikiName("");
    await loadWikis();
  };

  const apiUpdateWiki = async () => {
    if (!selectedWiki) {
      return;
    }
    let wikiId = String(selectedWiki.wikiId);
    let title = selectedWiki.title;
    let content = selectedWiki.content;
    await updateWiki(wikiId, title, content);
    await loadWikis();
  };

  const apiDeleteWiki = async () => {
    if (!deleteChecked || !selectedWiki) {
      setDeleteChecked(false);
      return;
    }
    let wikiId = String(selectedWiki.wikiId);
    await deleteWiki(wikiId);
    setSelectedWiki(null);
    setDeleteChecked(false);
    await loadWikis();
  };

  return (
    <div className="flex h-full">
      <Sidebar 
        wikis={wikis}
        onSelect={handleSelect} 
      />

      <main className="flex-1">
        <div className="flex items-center justify-between">
          <h1>Wiki</h1>

          <div className="flex items-center gap-2">
            <Button
              onClick={apiUpdateWiki}>
              <Save size={18} />
              <span>保存</span>
            </Button>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={deleteChecked}
                onChange={(e) => setDeleteChecked(e.target.checked)}
              />
              <span>削除確認</span>
            </label>

            <Button
              type="button"
              disabled={!deleteChecked}
              onClick={apiDeleteWiki}
              variant="danger"
            >
              削除
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={wikiName}
              onChange={(e) => setWikiName(e.target.value)}
              placeholder="Wiki名"
              maxLength={20}
            />

            <Button onClick={apiCreateWiki}>
              <FilePlus size={18} />
              <span>追加</span>
            </Button>
          </div>
        </div>
        <div className="h-[90%]">
          <main className="flex h-full flex-col p-6">
            {selectedWiki ? (
              <>
                <input
                  className="mb-4 border-b p-2 text-xl font-bold outline-none"
                  value={selectedWiki.title}
                  onChange={(e) =>
                    setSelectedWiki({
                      ...selectedWiki,
                      title: e.target.value,
                    })
                  }
                />

                <textarea
                  className="flex-1 resize-none rounded-md border p-4 outline-none"
                  value={selectedWiki.content}
                  onChange={(e) =>
                    setSelectedWiki({
                      ...selectedWiki,
                      content: e.target.value,
                    })
                  }
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-slate-400">
                Wikiを選択してください
              </div>
            )}
          </main>
        </div>
      </main>
    </div>
  );
}
