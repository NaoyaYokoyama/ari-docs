// DBテーブルに対応するため、未使用のカラムも保持する
#[allow(dead_code)]
#[derive(Debug)]
pub struct User {
    pub user_id: String,
    pub passwd: String,
    pub display_name: String,
    pub role_id: String,
    pub updated_at: String,
}
