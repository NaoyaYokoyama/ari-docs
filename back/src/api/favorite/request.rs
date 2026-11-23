use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFavoriteNodeRequest {
    pub path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFavoriteRequest {
    pub id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteIdRequest {
    pub favorite_id: String,
}

// 並べ替え（API0606。FN0601-BR08）。上からの順
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteOrderRequest {
    pub favorite_ids: Vec<String>,
}
