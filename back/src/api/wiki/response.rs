use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiResponse {
    pub wikis: Vec<Wiki>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wiki {
    pub wiki_id: i64,
    pub title: String,
    pub content: String,
    pub updated_at: String,
}
