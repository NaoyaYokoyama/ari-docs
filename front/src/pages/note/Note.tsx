import { useEffect, useState } from "react";
import { FilePlus, Save } from "lucide-react";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import Sidebar from "@/pages/note/Sidebar";

import { getNotes, getNote, createNote, deleteNote } from "@/api/note";
import type { Note as NoteType } from "@/types/note";

export default function Note() {
  const [notes, setNotes] = useState<NoteType[]>([]);
  const [noteName, setNoteName] = useState("");
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);

  const handleSelect = async (noteId: string) => {
    try {
      const note = await getNote(noteId);
      setSelectedNote(note);
    } catch (error) {
      console.error("メモの取得に失敗しました", error);
    }
  };

  useEffect(() => {
    const loadNotes = async () => {
      try {
        const response = await getNotes();
        setNotes(response.notes);
      } catch (error) {
        console.error("メモ一覧の取得に失敗しました", error);
      }
    };

    loadNotes();
  }, []);

  const createNote = () => {
    const trimmedName = noteName.trim();

    if (!trimmedName) {
      return;
    }

    // TODO: メモ作成API
    console.log("create:", trimmedName);

    setNoteName("");
  };

  const saveNote = () => {
    // TODO: メモ保存API
    console.log("save");
  };

  const deleteNote = () => {
    if (!deleteChecked) {
      return;
    }

    // TODO: メモ削除API
    console.log("delete");

    setDeleteChecked(false);
  };

  return (
    <div className="flex h-full">
      <Sidebar 
        notes={notes}
        onSelect={handleSelect} 
      />

      <main className="flex-1 p-6">
        <div className="flex items-center justify-between">
          <h1>個人メモ</h1>

          <div className="flex items-center gap-2">
            <Button onClick={saveNote}>
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
              onClick={deleteNote}
              variant="danger"
            >
              削除
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={noteName}
              onChange={(e) => setNoteName(e.target.value)}
              placeholder="メモ名"
              maxLength={20}
            />

            <Button onClick={createNote}>
              <FilePlus size={18} />
              <span>追加</span>
            </Button>
          </div>
        </div>
        <div>
          <main className="flex flex-1 flex-col p-6">
            {selectedNote ? (
              <>
                <input
                  className="mb-4 border-b p-2 text-xl font-bold outline-none"
                  value={selectedNote.title}
                  readOnly
                />

                <textarea
                  className="flex-1 resize-none rounded-md border p-4 outline-none"
                  value={selectedNote.content}
                  readOnly
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-slate-400">
                メモを選択してください
              </div>
            )}
          </main>
        </div>
      </main>
    </div>
  );
}
