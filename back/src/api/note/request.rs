use serde::Deserialize;
use validator::Validate;

use crate::api::validation::not_blank;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteQuery {
    pub note_id: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    #[validate(
        custom(function = "not_blank"),
        length(max = 25, message = "タイトルは25文字以内で入力してください。")
    )]
    pub title: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNoteRequest {
    pub note_id: String,
    #[validate(
        custom(function = "not_blank"),
        length(max = 25, message = "タイトルは25文字以内で入力してください。")
    )]
    pub title: String,
    pub content: String,
    // 開いたときの更新日時。今の更新日時と違えば保存しない（無ければ確かめない。FN0501-BR10）
    #[serde(default)]
    pub base_updated_at: Option<String>,
    // 食い違っていても上書きする
    #[serde(default)]
    pub force: bool,
}
