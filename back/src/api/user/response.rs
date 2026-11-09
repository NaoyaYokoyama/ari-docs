use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserItem {
    pub user_id: String,
    pub display_name: String,
    pub is_admin: bool,
    pub updated_at: String,
}
