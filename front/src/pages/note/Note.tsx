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
  createFavoriteNote,
  deleteFavorite,
} from "@/api/favorite";
import {
  createNote,
  deleteNote,
  getNote,
  getNotes,
  updateNote,
} from "@/api/note";
import { useApp } from "@/app/AppContext";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Sidebar from "@/pages/note/Sidebar";
import { useFocusNavigation } from "@/shortcut/useFocusNavigation";
import remarkBreaks from "remark-breaks";
import type {
  Note as NoteType,
} from "@/types/note";

import MDEditor, {
  commands,
} from "@uiw/react-md-editor";

export default function Note() {
  const location = useLocation();

  const {
    showMessage,
    showConfirm,
    isDirty,
    setIsDirty,
  } = useApp();

  const [notes, setNotes] =
    useState<NoteType[]>([]);
  const [noteName, setNoteName] =
    useState("");
  const [selectedNote, setSelectedNote] =
    useState<NoteDetail | null>(null);
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

  // Note一覧取得
  const loadNotes = async () => {
    try {
      const response = await getNotes();

      setNotes(response.notes);
    } catch (error) {
      console.error(
        "Note一覧の取得に失敗しました",
        error,
      );
    }
  };

  // Note選択
  const handleSelectNote = async (
    noteId: string,
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
      const note = await getNote(noteId);
      setSelectedNote(note);
      setIsDirty(false);
    } catch (error) {
      console.error(
        "Noteの取得に失敗しました",
        error,
      );
    }
  };

  // 初期表示
  useEffect(() => {
    loadNotes();

    const noteId = location.state?.noteId;

    if (noteId) {
      handleSelectNote(noteId);
    }
    requestAnimationFrame(() => {
      sidebarRef.current?.focus();
    });
  }, []);

  // Ctrl + SでNoteを保存
  useEffect(() => {
    const handleKeyDown = (
      e: KeyboardEvent,
    ) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleUpdateNote();
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
  }, [selectedNote]);

  // Note作成
  const handleCreateNote = async () => {
    let result;
    try {
      const trimmedName = noteName.trim();
      if (!trimmedName) {
        return;
      }
      result = await createNote(trimmedName);
      setNoteName("");
      await loadNotes();
      showMessage(
        "info",
        "Noteを作成しました",
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
          "Noteの登録に失敗しました",
        );
      }
    }
  };

  // Note更新
  const handleUpdateNote = async () => {
    if (!selectedNote) {
      return;
    }

    try {
      const noteId = String(
        selectedNote.noteId,
      );

      const title = selectedNote.title;
      const content = selectedNote.content;

      await updateNote(
        noteId,
        title,
        content,
      );

      await loadNotes();

      showMessage(
        "info",
        "Noteを更新しました",
      );

      setIsDirty(false);
    } catch (error) {
      console.log(error);

      showMessage(
        "error",
        "Noteの更新に失敗しました",
      );
    }
  };

  // Note削除
  const handleDeleteNote = async () => {
    if (!selectedNote) {
      return;
    }

    const confirmed = await showConfirm(
      "Note「" +
        selectedNote.title +
        "」を削除しますか？",
    );

    if (!confirmed) {
      return;
    }

    try {
      const noteId = String(
        selectedNote.noteId,
      );

      await deleteNote(noteId);

      setSelectedNote(null);

      showMessage(
        "info",
        "Noteを削除しました",
      );

      await loadNotes();
    } catch (error) {
      console.log(error);

      showMessage(
        "error",
        "Noteの削除に失敗しました",
      );
    }
  };

  // Noteをお気に入り登録
  const handleCreateFavoriteNote =
    async () => {
      if (!selectedNote) {
        return;
      }

      const noteId = String(
        selectedNote.noteId,
      );

      try {
        const response =
          await createFavoriteNote(noteId);

        showMessage(
          "info",
          "Noteをお気にいり登録しました",
        );

        setSelectedNote({
          ...selectedNote,
          favoriteId:
            response.data.favoriteId,
        });
      } catch (error) {
        console.log(error);

        showMessage(
          "error",
          "Noteのお気に入り登録に失敗しました",
        );
      }
    };

  // Noteのお気に入り解除
  const handleDeleteFavoriteNote =
    async () => {
      if (!selectedNote) {
        return;
      }

      try {
        await deleteFavorite(
          selectedNote.favoriteId,
        );

        showMessage(
          "info",
          "Noteをお気にいり解除しました",
        );

        setSelectedNote({
          ...selectedNote,
          favoriteId: "",
        });
      } catch (error) {
        console.log(error);

        showMessage(
          "error",
          "Noteのお気に入り解除に失敗しました",
        );
      }
    };

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <Sidebar
        ref={sidebarRef}
        notes={notes}
        onSelect={handleSelectNote}
      />
    <main className="min-h-0 min-w-0 flex-1 overflow-hidden p-0">
      <div className="h-full min-h-0 w-full">
        <main className="flex h-full min-h-0 w-full flex-col px-1 pt-2 pb-0">
            {selectedNote ? (
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
                    value={selectedNote.title}
                    onChange={(e) => {
                      setSelectedNote({
                        ...selectedNote,
                        title: e.target.value,
                      });

                      setIsDirty(true);
                    }}
                    maxLength={25}
                  />

                  <div className="ml-10 flex items-center gap-5">
                    <button
                        title="保存（Ctrl+S）"
                        onClick={handleUpdateNote}
                        className="cursor-pointer bg-transparent p-0"
                    >
                      <Save className="text-slate-500 hover:bg-slate-200" />
                    </button>

                    {selectedNote.favoriteId ? (
                      <button
                        type="button"
                        title="お気に入り解除"
                        onClick={handleDeleteFavoriteNote}
                        className="cursor-pointer bg-transparent p-0"
                      >
                        <Star className="fill-yellow-400 text-yellow-400 hover:bg-slate-100" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="お気に入り登録"
                        onClick={handleCreateFavoriteNote}
                        className="cursor-pointer bg-transparent p-0"
                      >
                        <Star  className="text-slate-500 hover:bg-slate-200" />
                      </button>
                    )}

                    <button
                        title="削除"
                        onClick={handleDeleteNote}
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
                          value={noteName}
                          onChange={(e) =>
                            setNoteName(
                              e.target.value,
                            )
                          }
                          placeholder="新規Note名"
                          maxLength={25}
                          className="w-60"
                        />

                        <Button
                          onClick={
                            handleCreateNote
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
                      selectedNote.content
                    }
                    previewOptions={{
                      remarkPlugins: [remarkBreaks],
                    }}
                    onChange={(value) => {
                      setSelectedNote({
                        ...selectedNote,
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
                      value={noteName}
                      onChange={(e) =>
                        setNoteName(
                          e.target.value,
                        )
                      }
                      placeholder="新規Note名"
                      maxLength={25}
                      className="w-80"
                    />

                    <Button
                      onClick={
                        handleCreateNote
                      }
                    >
                      <FilePlus size={18} />
                      <span>追加</span>
                    </Button>
                  </div>
                </div>

                <div className="flex flex-1 pt-10 text-slate-400">
                  Noteを選択してください
                </div>
              </div>
            )}
          </main>
        </div>
      </main>
    </div>
  );
}
