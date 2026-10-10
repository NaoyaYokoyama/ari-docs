export interface Note {
  noteId: string;
  title: string;
  updatedAt: string;
}

export interface NoteDetail {
  noteId: string;
  title: string;
  content: string;
  updatedAt: string;
  favoriteId: string;
}

export interface NoteList {
  notes: Note[];
}
