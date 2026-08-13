use crate::api::note::{Note, NoteResponse};

pub fn get_notes(user_id: &str) -> NoteResponse {
    let mut notes = Vec::new();

    notes.push(Note {
        user_id: user_id.to_string(),
        title: "Test Note 1".to_string(),
        contact: "test content 1".to_string(),
        updated_at: "2026-08-13 22:00:00".to_string(),
    });

    notes.push(Note {
        user_id: user_id.to_string(),
        title: "Test Note 2".to_string(),
        contact: "test content 2".to_string(),
        updated_at: "2026-08-13 22:10:00".to_string(),
    });

    NoteResponse { notes }
}
