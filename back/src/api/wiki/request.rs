use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiQuery {
    pub wiki_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWikiRequest {
    pub title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWikiRequest {
    pub wiki_id: String,
    pub title: String,
    pub content: String,
}
