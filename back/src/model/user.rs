// DBテーブルに対応するため、未使用のカラムも保持する
#[allow(dead_code)]
#[derive(Debug)]
pub struct User {
    pub user_id: String,
    pub passwd: String,
    pub display_name: String,
    pub role_id: String,
    pub updated_at: String,
    // 管理者だが、この PC は管理者の PC に登録していない（利用者として扱う。FN0102-BR12）。DB の列ではない
    pub admin_elsewhere: bool,
}
