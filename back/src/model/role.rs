// DBテーブルに対応するため、未使用のカラムも保持する
#[allow(dead_code)]
#[derive(Debug)]
pub struct Role {
    pub user_id: String,
    pub role: String,
    pub folder_permission: String,
    pub wiki_permission: String,
    pub manager_permission: String,
}
