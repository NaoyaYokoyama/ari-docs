import { createNote, getNotes, updateNote } from "@/api/note";
import { NOTE } from "@/pages/content/contentKinds";
import { customTemplates, fillTemplate, TODAY_TEMPLATE } from "@/pages/content/contentTemplates";
import { today } from "@/pages/task/taskView";

// 今日の Note（FN0401 の日々のメモ）。タイトルが今日の日付（YYYY-MM-DD）の Note を返し、無ければ作る。
// 「ひな形」フォルダに「今日の Note」があれば、その本文で作る（FN0401-BR16）
export async function todayNoteId() {
  const title = today();
  const { notes } = await getNotes();
  const found = notes.find((note) => note.title === title);
  if (found) {
    return found.noteId;
  }
  const created = await createNote(title);
  const template = (await customTemplates(NOTE).catch(() => [])).find((item) => item.name === TODAY_TEMPLATE);
  if (template?.body) {
    await updateNote(created.noteId, title, fillTemplate(template.body), created.updatedAt);
  }
  return created.noteId;
}
