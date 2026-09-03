use serde::Deserialize;
use validator::Validate;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiQuery {
    pub wiki_id: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateWikiRequest {
    #[validate(length(
        min = 1,
        max = 20,
        message = "Wiki名は1文字以上20文字以内で入力してください。"
    ))]
    pub title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWikiRequest {
    pub wiki_id: String,
    pub title: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteWikiRequest {
    pub wiki_id: String,
}
