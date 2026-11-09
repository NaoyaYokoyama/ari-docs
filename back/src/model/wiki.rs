// DBテーブルに対応するため、未使用のカラムも保持する
#[allow(dead_code)]
#[derive(Debug)]
pub struct Wiki {
    pub wiki_id: String,
    pub user_id: String,
    pub title: String,
    pub content: String,
    pub updated_at: String,
}
