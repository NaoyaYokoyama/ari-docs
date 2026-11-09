// DBテーブルに対応するため、未使用のカラムも保持する
#[allow(dead_code)]
#[derive(Debug)]
pub struct Favorite {
    pub favorite_id: String,
    pub user_id: String,
    pub node_id: String,
    pub note_id: String,
    pub wiki_id: String,
}
