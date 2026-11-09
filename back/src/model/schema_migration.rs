// DBテーブルに対応するため、未使用のカラムも保持する
#[allow(dead_code)]
pub struct SchemaMigration {
    pub migration_name: String,
}
