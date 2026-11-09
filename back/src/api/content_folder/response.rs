use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderItem {
    pub folder_id: String,
    // 空なら一番上
    pub parent_id: String,
    pub name: String,
}

// Note・Wiki の入っているフォルダ。一番上にあるものは含めない
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacedItem {
    pub item_id: String,
    pub folder_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoldersResponse {
    pub folders: Vec<FolderItem>,
    pub items: Vec<PlacedItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedFolder {
    pub folder_id: String,
}
