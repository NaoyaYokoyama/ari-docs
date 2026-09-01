#[derive(Debug)]
pub struct Role {
    pub user_id: String,
    pub role: String,
    pub folder_permission: String,
    pub wiki_permission: String,
    pub manager_permission: String,
}
