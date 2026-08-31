use crate::model::favorite::Favorite;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchItem {
    pub view_type: String,
    pub name: String,
    pub node_id: String,
    pub note_id: String,
    pub wiki_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub search_items: Vec<SearchItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteListResponse {
    pub favorite_list: Vec<FavoriteItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteItem {
    pub view_type: String,
    pub name: String,
    pub node_id: String,
    pub note_id: String,
    pub wiki_id: String,
}
