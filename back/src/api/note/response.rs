use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteResponse {
    pub notes: Vec<Note>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub note_id: i64,
    pub title: String,
    pub content: String,
    pub updated_at: String,
}
