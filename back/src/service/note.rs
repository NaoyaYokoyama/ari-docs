use rusqlite::Connection;

use crate::{
    api::note::{Note, NoteResponse},
    repository::note as note_repository,
};

pub fn get_notes(conn: &Connection, user_id: &str) -> rusqlite::Result<NoteResponse> {
    let notes = note_repository::find_by_user_id(conn, user_id)?;

    let notes = notes
        .into_iter()
        .map(|note| Note {
            note_id: note.note_id,
            title: note.title,
            updated_at: note.updated_at,
        })
        .collect();

    Ok(NoteResponse { notes })
}
