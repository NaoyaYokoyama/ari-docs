use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteIdResponse {
    pub favorite_id: String,
}
