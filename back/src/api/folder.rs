use axum::Json;

use crate::service::folder;

pub async fn get_folders() -> Json<Vec<crate::model::folder::Folder>> {
    Json(folder::get_folders())
}
