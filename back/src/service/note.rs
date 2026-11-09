use crate::{
    api::note::{response::Note, response::NoteResponse},
    common::id::generate_note_id,
    repository::{
        content_folder as folder_repo, favorite as favorite_repo, history as history_repo,
        note as note_repo,
    },
    service::content::{self, Current, SaveError},
};
use rusqlite::Connection;

pub fn get_notes(conn: &Connection, user_id: &str) -> rusqlite::Result<NoteResponse> {
    let notes = note_repo::find_by_user_id(conn, user_id)?;

    let notes = notes
        .into_iter()
        .map(|note| Note {
            note_id: note.note_id,
            title: note.title,
            content: note.content,
            updated_at: note.updated_at,
            favorite_id: "".to_string(),
        })
        .collect();

    Ok(NoteResponse { notes })
}

pub fn get_note(conn: &Connection, user_id: &str, note_id: &str) -> rusqlite::Result<Note> {
    let note_result = note_repo::find_by_note_id(conn, user_id, note_id)?;
    let favorite_result = favorite_repo::find_by_note_id(conn, user_id, note_id)?;

    let mut note = Note {
        note_id: note_result.note_id,
        title: note_result.title,
        content: note_result.content,
        updated_at: note_result.updated_at,
        favorite_id: String::new(),
    };

    if let Some(favorite) = favorite_result {
        note.favorite_id = favorite.favorite_id;
    }

    Ok(note)
}

pub fn create_note(conn: &Connection, user_id: &str, title: &str) -> rusqlite::Result<Note> {
    let note_id = generate_note_id();
    note_repo::create_note(conn, user_id, &note_id, title)?;
    println!("created note_id: {}", &note_id);

    let note_result = note_repo::find_by_note_id(conn, user_id, &note_id)?;

    let note = Note {
        note_id: note_result.note_id,
        title: note_result.title,
        content: note_result.content,
        updated_at: note_result.updated_at,
        favorite_id: "".to_string(),
    };
    Ok(note)
}

pub fn delete_note(conn: &Connection, user_id: &str, note_id: &str) -> rusqlite::Result<usize> {
    favorite_repo::delete_favorite_note(conn, user_id, note_id)?;
    history_repo::delete_by_content(conn, "note", note_id)?;
    let result = note_repo::delete_note(conn, user_id, note_id)?;
    // 本人の Note のときだけ（ほかの人の Note の入れ場所は消さない）
    if result > 0 {
        folder_repo::delete_item(conn, "note", note_id)?;
    }
    Ok(result)
}

// 保存（FN0402）。同じ人がほかの PC で更新していたら、force でなければ保存しない。保存したあとの更新日時を返す
pub fn update_note(
    conn: &Connection,
    user_id: &str,
    note_id: &str,
    title: &str,
    content: &str,
    base_updated_at: Option<&str>,
    force: bool,
) -> Result<String, SaveError> {
    let note = note_repo::find_by_note_id(conn, user_id, note_id)?;
    let current = Current {
        title: note.title,
        content: note.content,
        updated_at: note.updated_at,
        updated_by: user_id.to_string(),
        who: "ほかの画面（PC）で".to_string(),
    };
    content::save(
        conn,
        "note",
        note_id,
        user_id,
        current,
        base_updated_at,
        force,
        || note_repo::update_note(conn, user_id, note_id, title, content),
        || note_repo::find_by_note_id(conn, user_id, note_id).map(|note| note.updated_at),
        title,
        content,
    )
}
