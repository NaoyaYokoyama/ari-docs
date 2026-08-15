import { get, post } from "@/api/client";
import type { NoteList, NoteDetail  } from "@/types/note";

export function getNotes() {
  return get<NoteList>("/api/notes");
}


export function getNote(noteId: string) {
  return get<NoteDetail>(`/api/note/${noteId}`);
}

export function createNote(
  title: string,
  content: string,
) {
  return post("/api/note/create", {
    title, content,
  });
}

export function deleteNote(
  noteId: string,
) {
  return post("/api/note/delete", {
    nodeId,
  });
}
