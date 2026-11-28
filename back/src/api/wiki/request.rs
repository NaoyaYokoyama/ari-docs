use serde::Deserialize;
use validator::Validate;

use crate::api::validation::not_blank;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiQuery {
    pub wiki_id: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateWikiRequest {
    #[validate(
        custom(function = "not_blank"),
        length(max = 25, message = "タイトルは25文字以内で入力してください。")
    )]
    pub title: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWikiRequest {
    pub wiki_id: String,
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

// 書いている・やめたを知らせる（API0507。同時編集のお知らせ）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditingRequest {
    pub wiki_id: String,
    pub editing: bool,
    // 書いている人を確かめるだけ（開いたとき・読んでいる間。FN0501-BR11）
    #[serde(default)]
    pub check: bool,
    // 管理者がロックを外す（FN0501-BR12）
    #[serde(default)]
    pub release: bool,
}
