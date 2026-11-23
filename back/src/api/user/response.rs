use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserItem {
    pub user_id: String,
    pub display_name: String,
    pub is_admin: bool,
    // 付けた許可（FN0102-BR11）。管理者は表によらずすべてできるので、ここには付けたものだけを返す
    pub permissions: Vec<String>,
    pub updated_at: String,
}
