// DBテーブルに対応するため、未使用のカラムも保持する
#[allow(dead_code)]
#[derive(Debug)]
pub struct Node {
    pub node_id: String,
    pub path: String,
    pub description: String,
    pub status: String,
    pub updated_by: String,
    pub updated_at: String,
}
