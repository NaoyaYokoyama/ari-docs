import { useEffect, useState } from "react";
import { FilePlus, Save, Star } from "lucide-react";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Sidebar from "@/pages/wiki/Sidebar";

import { getWikis, getWiki, createWiki, updateWiki, deleteWiki } from "@/api/wiki";
import { createFavoriteWiki, deleteFavorite } from "@/api/favorite";
import type { Wiki as WikiType } from "@/types/wiki";

export default function Wiki() {
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingWikiId, setPendingWikiId] = useState<string | null>(
    null,
  );
  const [wikis, setWikis] = useState<WikiType[]>([]);
  const [wikiName, setWikiName] = useState("");
  const [favoriteId, setFavoriteId] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [selectedWiki, setSelectedWiki] = useState<WikiDetail | null>(null);

  const { showMessage } = useApp();

  const handleSelect = async (wikiId: string) => {
    if (isDirty) {
      const confirmed = window.confirm(
        "未保存の変更があります。破棄して移動しますか？",
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      const wiki = await getWiki(wikiId);
      setSelectedWiki(wiki);
      setIsDirty(false);
    } catch (error) {
      console.error("Wikiの取得に失敗しました", error);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setContent(e.target.value);
    setIsDirty(true);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        apiUpdateWiki();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedWiki]);

  const apiCreateWiki = async () => {
    try {
      const trimmedName = wikiName.trim();
      if (!trimmedName) {
        return;
      }
      const response = await createWiki(trimmedName);
      setWikiName("");
      await loadWikis();
      showMessage("Wikiを作成しました");
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      }
    }
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
    showMessage("Wikiを更新しました");
    setIsDirty(false);
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
    showMessage("Wikiを削除しました");
    await loadWikis();
  };

  const apiCreateFavoriteWiki = async () => {
    let wikiId = String(selectedWiki.wikiId);
    await createFavoriteWiki(wikiId);
    showMessage("Wikiをお気にいり登録しました");
  };

  const apiDeleteFavoriteWiki = async () => {
    let wikiId = String(selectedWiki.wikiId);
    await deleteFavorite(selectedWiki.favoriteId);
    showMessage("Wikiをお気にいり解除しました");
  };

  return (
    <div className="flex h-full">
      <Sidebar 
        wikis={wikis}
        onSelect={handleSelect} 
      />

      <main className="flex-1">
        {errorMessage && (
          <p className="text-red-500">
            {errorMessage}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              onClick={apiUpdateWiki}>
              <Save size={18} />
              <span>保存</span>
            </Button>

            {selectedWiki && (
              <div>
                {selectedWiki.favoriteId ? (
                  <Button
                    onClick={apiDeleteFavoriteWiki}
                  >
                    <Star size={18} />
                    お気に入り解除
                  </Button>
                ) : (
                  <Button
                    onClick={apiCreateFavoriteWiki}
                  >
                    <Star size={18} />
                    お気に入り登録
                  </Button>
                )}
              </div>
            )}

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
                {isDirty && (
                  <span className="text-sm text-slate-500">
                    ● 未保存
                  </span>
                )}
                <input
                  className="mb-4 border-b p-2 text-xl font-bold outline-none"
                  value={selectedWiki.title}
                  onChange={(e) => {
                    setSelectedWiki({
                      ...selectedWiki,
                      title: e.target.value,
                    });
                    setIsDirty(true);
                  }}
                />

                <textarea
                  className="flex-1 resize-none rounded-md border p-4 outline-none"
                  value={selectedWiki.content}
                  onChange={(e) => {
                    setSelectedWiki({
                      ...selectedWiki,
                      content: e.target.value,
                    });
                    setIsDirty(true);
                  }}
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
