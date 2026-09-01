use crate::{
    api::note::{response::Note, response::NoteResponse},
    common::id::generate_note_id,
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
    let note_result = note_repository::find_by_note_id(conn, user_id, note_id)?;

    let note = Note {
        note_id: note_result.note_id,
        title: note_result.title,
        content: note_result.content,
        updated_at: note_result.updated_at,
    };

    Ok(note)
}

pub fn create_note(conn: &Connection, user_id: &str, title: &str) -> rusqlite::Result<Note> {
    let note_id = generate_note_id();
    note_repository::create_note(conn, user_id, &note_id, title)?;
    println!("created note_id: {}", &note_id);

    let note_result = note_repository::find_by_note_id(conn, user_id, &note_id)?;

    let note = Note {
        note_id: note_result.note_id,
        title: note_result.title,
        content: note_result.content,
        updated_at: note_result.updated_at,
    };
    Ok(note)
}

pub fn delete_note(conn: &Connection, user_id: &str, note_id: &str) -> rusqlite::Result<usize> {
    let result = note_repository::delete_note(conn, user_id, note_id)?;
    Ok(result)
}

pub fn update_note(
    conn: &Connection,
    user_id: &str,
    note_id: &str,
    title: &str,
    content: &str,
) -> rusqlite::Result<usize> {
    let result = note_repository::update_note(conn, user_id, note_id, title, content)?;
    Ok(result)
}
