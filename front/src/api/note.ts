import { get, post } from "@/api/client";
import type { NoteDetail, NoteList } from "@/types/note";

export function getNotes() {
  return get<NoteList>("/api/notes");
}


export function getNote(noteId: string) {
  return get<NoteDetail>(`/api/note/${noteId}`);
}

export function createNote(
  title: string,
) {
  return post<NoteDetail>("/api/note/create", {
    title,
  });
}

// baseUpdatedAt（開いたときの更新日時）と今の更新日時が違えば 409（force なら上書きする）。保存したあとの更新日時を返す
export function updateNote(
  noteId: string,
  title: string,
  content: string,
  baseUpdatedAt?: string,
  force = false,
) {
  return post<{ message: string; data: { updatedAt: string } }>("/api/note/update", {
    noteId,
    title,
    content,
    baseUpdatedAt,
    force,
  });
}

export function deleteNote(
  noteId: string,
) {
  return post("/api/note/delete", {
    noteId,
  });
}
