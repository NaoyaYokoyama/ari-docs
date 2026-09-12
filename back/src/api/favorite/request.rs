use serde::Deserialize;
use validator::Validate;

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
