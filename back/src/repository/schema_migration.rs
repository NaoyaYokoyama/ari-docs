use crate::model::schema_migration::SchemaMigration

pub fn insert(
  conn: &Connection
  , obj: &SchemaMigration
) -> Result<()> {
  conn.execute(
    "
    INSERT INTO schema_migration
    (
      migration_name
    )
    VALUES
    (
      ?1
    )
    ",
    (
      &obj.migration_name
    )
  )?;
  Ok(())
}
