use serde::Deserialize;
use validator::Validate;

use crate::api::validation::not_blank;

// kind は "note" / "wiki"
#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderRequest {
    pub kind: String,
    // 親のフォルダ。空なら一番上
    #[serde(default)]
    pub parent_id: String,
    #[validate(
        custom(function = "not_blank"),
        length(max = 25, message = "フォルダの名前は25文字以内で入力してください。")
    )]
    pub name: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderRequest {
    pub kind: String,
    pub folder_id: String,
    #[validate(
        custom(function = "not_blank"),
        length(max = 25, message = "フォルダの名前は25文字以内で入力してください。")
    )]
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFolderRequest {
    pub kind: String,
    pub folder_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveRequest {
    pub kind: String,
    #[serde(default)]
    pub folder_ids: Vec<String>,
    // note_id / wiki_id
    #[serde(default)]
    pub item_ids: Vec<String>,
    // 移す先のフォルダ。空なら一番上
    #[serde(default)]
    pub dest_id: String,
}
