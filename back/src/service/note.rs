use crate::{
    api::note::{response::Note, response::NoteResponse},
    repository::note as note_repository,
};
use rusqlite::Connection;

pub fn get_notes(conn: &Connection, user_id: &str) -> rusqlite::Result<NoteResponse> {
    let notes = note_repository::find_by_user_id(conn, user_id)?;

    let notes = notes
        .into_iter()
        .map(|note| Note {
            note_id: note.note_id,
            title: note.title,
            content: note.content,
            updated_at: note.updated_at,
        })
        .collect();

    Ok(NoteResponse { notes })
}

pub fn get_note(conn: &Connection, user_id: &str, note_id: &str) -> rusqlite::Result<Note> {
    let noteResult = note_repository::find_by_note_id(conn, note_id, user_id)?;

    let note = (Note {
        note_id: noteResult.note_id,
        title: noteResult.title,
        content: noteResult.content,
        updated_at: noteResult.updated_at,
    });

    Ok(note)
}
