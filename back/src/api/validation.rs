use validator::ValidationError;

// 前後の空白を除いて空の文字列を弾く（length の min では空白だけの入力を通してしまうため）
pub fn not_blank(value: &str) -> Result<(), ValidationError> {
    if value.trim().is_empty() {
        return Err(
            ValidationError::new("blank").with_message("タイトルを入力してください。".into())
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_blank_rejects_whitespace_only() {
        assert!(not_blank("メモ").is_ok());
        assert!(not_blank(" a ").is_ok());
        for value in ["", " ", "　", "\t\n"] {
            assert!(not_blank(value).is_err(), "{value:?}");
        }
    }
}
