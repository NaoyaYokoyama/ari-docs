import { createNote, getNotes } from "@/api/note";
import { today } from "@/pages/task/taskView";

// 今日の Note（FN0401 の日々のメモ）。タイトルが今日の日付（YYYY-MM-DD）の Note を返し、無ければ作る
export async function todayNoteId() {
  const title = today();
  const { notes } = await getNotes();
  const found = notes.find((note) => note.title === title);
  if (found) {
    return found.noteId;
  }
  return (await createNote(title)).noteId;
}
