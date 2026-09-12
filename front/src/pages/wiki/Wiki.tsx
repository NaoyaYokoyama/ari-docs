import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import {
  CircleCheck,
  FilePlus,
  Save,
  Star,
  Trash2,
} from "lucide-react";

import {
  createFavoriteWiki,
  deleteFavorite,
} from "@/api/favorite";
import {
  createWiki,
  deleteWiki,
  getWiki,
  getWikis,
  updateWiki,
} from "@/api/wiki";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Sidebar from "@/pages/wiki/Sidebar";
import { useFocusNavigation } from "@/shortcut/useFocusNavigation";
import remarkBreaks from "remark-breaks";
import type {
  Wiki as WikiType,
} from "@/types/wiki";

import MDEditor, {
  commands,
} from "@uiw/react-md-editor";

export default function Wiki() {
  const location = useLocation();

  const {
    showMessage,
    showConfirm,
    isDirty,
    setIsDirty,
  } = useApp();

  const [wikis, setWikis] =
    useState<WikiType[]>([]);
  const [wikiName, setWikiName] =
    useState("");
  const [selectedWiki, setSelectedWiki] =
    useState<WikiDetail | null>(null);
  const [mdMode, setMdMode] = useState<"edit" | "live" | "preview" >("preview");

  const sidebarRef =
    useRef<HTMLDivElement>(null);

  const titleRef =
    useRef<HTMLInputElement>(null);

  const editorRef =
    useRef<HTMLDivElement>(null);

  useFocusNavigation({
    left: () => {
      sidebarRef.current?.focus();
    },

    right: () => {
      titleRef.current?.focus();
    },

    up: () => {
      titleRef.current?.focus();
    },

    down: () => {
      editorRef.current
        ?.querySelector("textarea")
        ?.focus();
    },
  });

  // Wiki一覧取得
  const loadWikis = async () => {
    try {
      const response = await getWikis();

      setWikis(response.wikis);
    } catch (error) {
      console.error(
        "Wiki一覧の取得に失敗しました",
        error,
      );
    }
  };

  // Wiki選択
  const handleSelectWiki = async (
    wikiId: string,
  ) => {
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
      console.error(
        "Wikiの取得に失敗しました",
        error,
      );
    }
  };

  // 初期表示
  useEffect(() => {
    loadWikis();

    const wikiId = location.state?.wikiId;

    if (wikiId) {
      handleSelectWiki(wikiId);
    }
    requestAnimationFrame(() => {
      sidebarRef.current?.focus();
    });
  }, []);

  // Ctrl + SでWikiを保存
  useEffect(() => {
    const handleKeyDown = (
      e: KeyboardEvent,
    ) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleUpdateWiki();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [selectedWiki]);

  // Wiki作成
  const handleCreateWiki = async () => {
    let result;
    try {
      const trimmedName = wikiName.trim();
      if (!trimmedName) {
        return;
      }
      result = await createWiki(trimmedName);
      setWikiName("");
      await loadWikis();
      showMessage(
        "info",
        "Wikiを作成しました",
      );
    } catch (error) {
      if (error.message) {
        showMessage(
          "error",
          error.message
        );
      } else {
        showMessage(
          "error",
          "Wikiの登録に失敗しました",
        );
      }
    }
  };

  // Wiki更新
  const handleUpdateWiki = async () => {
    if (!selectedWiki) {
      return;
    }

    try {
      const wikiId = String(
        selectedWiki.wikiId,
      );

      const title = selectedWiki.title;
      const content = selectedWiki.content;

      await updateWiki(
        wikiId,
        title,
        content,
      );

      await loadWikis();

      showMessage(
        "info",
        "Wikiを更新しました",
      );

      setIsDirty(false);
    } catch (error) {
      console.log(error);

      showMessage(
        "error",
        "Wikiの更新に失敗しました",
      );
    }
  };

  // Wiki削除
  const handleDeleteWiki = async () => {
    if (!selectedWiki) {
      return;
    }

    const confirmed = await showConfirm(
      "Wiki「" +
        selectedWiki.title +
        "」を削除しますか？",
    );

    if (!confirmed) {
      return;
    }

    try {
      const wikiId = String(
        selectedWiki.wikiId,
      );

      await deleteWiki(wikiId);

      setSelectedWiki(null);

      showMessage(
        "info",
        "Wikiを削除しました",
      );

      await loadWikis();
    } catch (error) {
      console.log(error);

      showMessage(
        "error",
        "Wikiの削除に失敗しました",
      );
    }
  };

  // Wikiをお気に入り登録
  const handleCreateFavoriteWiki =
    async () => {
      if (!selectedWiki) {
        return;
      }

      const wikiId = String(
        selectedWiki.wikiId,
      );

      try {
        const response =
          await createFavoriteWiki(wikiId);

        showMessage(
          "info",
          "Wikiをお気にいり登録しました",
        );

        setSelectedWiki({
          ...selectedWiki,
          favoriteId:
            response.data.favoriteId,
        });
      } catch (error) {
        console.log(error);

        showMessage(
          "error",
          "Wikiのお気に入り登録に失敗しました",
        );
      }
    };

  // Wikiのお気に入り解除
  const handleDeleteFavoriteWiki =
    async () => {
      if (!selectedWiki) {
        return;
      }

      try {
        await deleteFavorite(
          selectedWiki.favoriteId,
        );

        showMessage(
          "info",
          "Wikiをお気にいり解除しました",
        );

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
    <div className="flex h-full min-h-0 overflow-hidden">
      <Sidebar
        ref={sidebarRef}
        wikis={wikis}
        onSelect={handleSelectWiki}
      />
    <main className="min-h-0 min-w-0 flex-1 overflow-hidden p-0">
      <div className="h-full min-h-0 w-full">
        <main className="flex h-full min-h-0 w-full flex-col px-1 pt-2 pb-0">
            {selectedWiki ? (
              <>
                <div className="flex items-center gap-1.5">
                  {isDirty ? (
                    <>
                      <span className="text-xs text-orange-500">
                        ●
                      </span>
                      <span className="text-sm text-orange-500">
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
                    ref={titleRef}
                    className="mb-4 w-100 border-b py-2 text-base font-bold outline-none"
                    value={selectedWiki.title}
                    onChange={(e) => {
                      setSelectedWiki({
                        ...selectedWiki,
                        title: e.target.value,
                      });

                      setIsDirty(true);
                    }}
                    maxLength={25}
                  />

                  <div className="ml-10 flex items-center gap-5">
                    <button
                        title="保存（Ctrl+S）"
                        onClick={handleUpdateWiki}
                        className="cursor-pointer bg-transparent p-0"
                    >
                      <Save className="text-slate-500 hover:bg-slate-200" />
                    </button>

                    {selectedWiki.favoriteId ? (
                      <button
                        type="button"
                        title="お気に入り解除"
                        onClick={handleDeleteFavoriteWiki}
                        className="cursor-pointer bg-transparent p-0"
                      >
                        <Star className="fill-yellow-400 text-yellow-400 hover:bg-slate-100" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="お気に入り登録"
                        onClick={handleCreateFavoriteWiki}
                        className="cursor-pointer bg-transparent p-0"
                      >
                        <Star  className="text-slate-500 hover:bg-slate-200" />
                      </button>
                    )}

                    <button
                        title="削除"
                        onClick={handleDeleteWiki}
                        className="cursor-pointer bg-transparent p-0"
                    >
                      <Trash2 className="text-slate-500 hover:bg-slate-200" />
                    </button>

                    <Button
                      variant={mdMode === "edit" ? "primary" : "secondary"}
                      onClick={() => setMdMode("edit")}
                      >
                      <span>編集</span>
                    </Button>

                    <Button
                      variant={mdMode === "live" ? "primary" : "secondary"}
                      onClick={() => setMdMode("live")}
                      >
                      <span>分割</span>
                    </Button>

                    <Button
                      variant={mdMode === "preview" ? "primary" : "secondary"}
                      onClick={() => setMdMode("preview")}
                      >
                      <span>プレビュー</span>
                    </Button>

                    <div className="ml-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Input
                          value={wikiName}
                          onChange={(e) =>
                            setWikiName(
                              e.target.value,
                            )
                          }
                          placeholder="新規Wiki名"
                          maxLength={25}
                          className="w-60"
                        />

                        <Button
                          onClick={
                            handleCreateWiki
                          }
                        >
                          <FilePlus
                            size={18}
                          />
                          <span>追加</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  ref={editorRef}
                  className="flex-1 text-base overflow-hidden"
                  data-color-mode="light"
                >
                  <MDEditor
                    height="100%"
                    preview={mdMode}
                    value={
                      selectedWiki.content
                    }
                    previewOptions={{
                      remarkPlugins: [remarkBreaks],
                    }}
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
                      onChange={(e) =>
                        setWikiName(
                          e.target.value,
                        )
                      }
                      placeholder="新規Wiki名"
                      maxLength={25}
                      className="w-80"
                    />

                    <Button
                      onClick={
                        handleCreateWiki
                      }
                    >
                      <FilePlus size={18} />
                      <span>追加</span>
                    </Button>
                  </div>
                </div>

                <div className="flex flex-1 pt-10 text-slate-400">
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
