import { useEffect, useState } from "react";
import { CircleCheck, FilePlus, Save, Star, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Sidebar from "@/pages/wiki/Sidebar";

import MDEditor, { commands } from "@uiw/react-md-editor";

import { getWikis, getWiki, createWiki, updateWiki, deleteWiki } from "@/api/wiki";
import { createFavoriteWiki, deleteFavorite } from "@/api/favorite";
import type { Wiki as WikiType } from "@/types/wiki";

export default function Wiki() {
  const {
    showMessage,
    showConfirm,
    isDirty,
    setIsDirty,
  } = useApp();

  const [wikis, setWikis] = useState<WikiType[]>([]);
  const [wikiName, setWikiName] = useState("");
  const [selectedWiki, setSelectedWiki] = useState<WikiDetail | null>(null);

  const handleSelect = async (wikiId: string) => {
    if (isDirty) {
      const confirmed = await showConfirm(
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
      await createWiki(trimmedName);
      setWikiName("");
      await loadWikis();
      showMessage("info", "Wikiを作成しました");
    } catch (error) {
      console.log(error);
      showMessage(
        "error",
        "Wikiの登録に失敗しました",
      );
    }
  };

  const apiUpdateWiki = async () => {
    if (!selectedWiki) {
      return;
    }
    try {
      const wikiId = String(selectedWiki.wikiId);
      const  title = selectedWiki.title;
      const  content = selectedWiki.content;
      await updateWiki(wikiId, title, content);
      await loadWikis();
      showMessage("info", "Wikiを更新しました");
      setIsDirty(false);
    } catch (error) {
      console.log(error);
      showMessage(
        "error",
        "Wikiの更新に失敗しました",
      );
    }
  };

  const apiDeleteWiki = async () => {
    const confirmed = await showConfirm(
      "Wiki「" + selectedWiki.title + "」を削除しますか？",
    );
    if (!confirmed) {
      return;
    }
    try {
      let wikiId = String(selectedWiki.wikiId);
      await deleteWiki(wikiId);
      setSelectedWiki(null);
      showMessage("info", "Wikiを削除しました");
    } catch (error) {
      console.log(error);
      showMessage(
        "error",
        "Wikiの削除に失敗しました",
      );
    }
    await loadWikis();
  };

  const apiCreateFavoriteWiki = async () => {
    let wikiId = String(selectedWiki.wikiId);
    try {
      const response = await createFavoriteWiki(wikiId);
      showMessage("info", "Wikiをお気にいり登録しました");
      setSelectedWiki({
        ...selectedWiki,
        favoriteId: response.data.favoriteId,
      });
    } catch (error) {
      console.log(error);
      showMessage(
        "error",
        "Wikiのお気に入り登録に失敗しました",
      );
    }
  };

  const apiDeleteFavoriteWiki = async () => {
    try {
      await deleteFavorite(selectedWiki.favoriteId);
      showMessage("info", "Wikiをお気にいり解除しました");
      setSelectedWiki({
        ...selectedWiki,
        favoriteId: "",
      });
    } catch (error) {
      console.log(error);
      showMessage(
        "error",
        "Wikiのお気に入り解除に失敗しました",
      );
    }
  };

  return (
    <div className="flex h-full">
      <Sidebar 
        wikis={wikis}
        onSelect={handleSelect} 
      />

      <main className="flex-1 p-2">
        <div className="h-[90%]">
          <main className="flex h-full flex-col px-1 pt-2">
            {selectedWiki ? (
              <>
                <div className="flex items-center gap-1.5">
                  {isDirty ? (
                    <>
                      <span className="text-xs text-slate-500">
                        ●
                      </span>
                      <span className="text-sm text-slate-500">
                        未保存
                      </span>
                    </>
                  ) : (
                    <>
                      <CircleCheck
                        size={16}
                        className="text-slate-500"
                      />
                      <span className="text-sm text-slate-500">
                        保存済
                      </span>
                    </>
                  )}
                </div>

                <div className="flex">
                  <input
                    className="w-100 mb-4 border-b p-2 text-lg font-bold outline-none"
                    value={selectedWiki.title}
                    onChange={(e) => {
                      setSelectedWiki({
                        ...selectedWiki,
                        title: e.target.value,
                      });
                      setIsDirty(true);
                    }}
                    maxLength={20}
                  />


                <div className="ml-10 flex items-center gap-5">
                  <Save size={22}
                    title="保存"
                    onClick={apiUpdateWiki}
                    className="cursor-pointer text-slate-500 hover:bg-slate-200" />

                  {selectedWiki && (
                    <div>
                      {selectedWiki.favoriteId ? (
                        <Star size={22} 
                          title="お気に入り解除"
                          onClick={apiDeleteFavoriteWiki}
                          className="cursor-pointer fill-yellow-400 text-yellow-400 hover:bg-slate-100" />
                      ) : (
                        <Star size={22}
                          title="お気に入り登録"
                          onClick={apiCreateFavoriteWiki}
                          className="cursor-pointer text-slate-500 hover:bg-slate-200" />
                      )}
                    </div>
                  )}

                  <Trash2 size={22}
                    title="削除"
                    onClick={apiDeleteWiki}
                    className="cursor-pointer text-slate-500 hover:bg-slate-200" />

                  <div className="ml-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Input
                        value={wikiName}
                        onChange={(e) => setWikiName(e.target.value)}
                        placeholder="新規Wiki名"
                        maxLength={20}
                        className="w-80"
                      />

                      <Button onClick={apiCreateWiki}>
                        <FilePlus size={18} />
                        <span>追加</span>
                      </Button>
                    </div>
                  </div>

                </div>
              </div>
                    <div className="flex flex-1 flex-col pb-5">
                      <MDEditor
                        height="100%"
                        value={selectedWiki.content}
                        onChange={(value) => {
                          setSelectedWiki({
                            ...selectedWiki,
                            content: value ?? "",
                          });
                          setIsDirty(true);
                        }}
                        commands={[
                          commands.bold,
                          commands.italic,
                          commands.strikethrough,
                          commands.hr,
                          commands.title,
                          commands.divider,

                          commands.link,
                          commands.quote,
                          commands.code,
                          commands.codeBlock,
                          commands.divider,

                          commands.unorderedListCommand,
                          commands.orderedListCommand,
                          commands.checkedListCommand,
                        ]}
                      />
                    </div>

                    </>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Input
                            value={wikiName}
                            onChange={(e) => setWikiName(e.target.value)}
                            placeholder="新規Wiki名"
                            maxLength={20}
                            className="w-80"
                          />
                          <Button onClick={apiCreateWiki}>
                            <FilePlus size={18} />
                            <span>追加</span>
                          </Button>
                        </div>
                      </div>
                      <div className="pt-10 flex flex-1 text-slate-400">
                        Wikiを選択してください
                      </div>
                    </div>
                  )}

                </main>
              </div>
      </main>
    </div>
  );
}
