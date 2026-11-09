use serde::Deserialize;
use validator::{Validate, ValidationError};

// ユーザーID: 1〜32 文字の半角英数字と _ . -。local はローカルモードのユーザーのため使えない
pub fn validate_user_id(value: &str) -> Result<(), ValidationError> {
    let value = value.trim();
    let valid = !value.is_empty()
        && value.chars().count() <= 32
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    if !valid {
        return Err(error(
            "ユーザーIDは32文字以内の半角英数字と _ . - で入力してください。",
        ));
    }
    if value == "local" {
        return Err(error("このユーザーIDは使えません。"));
    }
    Ok(())
}

// 表示名: 前後の空白を除いて 1〜30 文字
pub fn validate_display_name(value: &str) -> Result<(), ValidationError> {
    let length = value.trim().chars().count();
    if length == 0 || length > 30 {
        return Err(error("表示名は1文字以上30文字以内で入力してください。"));
    }
    Ok(())
}

// パスワード: 8〜128 文字
pub fn validate_password(value: &str) -> Result<(), ValidationError> {
    let length = value.chars().count();
    if !(8..=128).contains(&length) {
        return Err(error(
            "パスワードは8文字以上128文字以内で入力してください。",
        ));
    }
    Ok(())
}

fn error(message: &'static str) -> ValidationError {
    ValidationError::new("invalid").with_message(message.into())
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserRequest {
    #[validate(custom(function = "validate_user_id"))]
    pub user_id: String,
    #[validate(custom(function = "validate_display_name"))]
    pub display_name: String,
    #[validate(custom(function = "validate_password"))]
    pub password: String,
    #[serde(default)]
    pub is_admin: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserIdRequest {
    pub user_id: String,
}

#[derive(Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ResetPasswordRequest {
    pub user_id: String,
    #[validate(custom(function = "validate_password"))]
    pub password: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_user_id_allows_only_safe_characters() {
        for value in ["taro", "taro.yamada", "a-1_b", &"a".repeat(32)] {
            assert!(validate_user_id(value).is_ok(), "{value}");
        }
        for value in ["", " ", "local", "太郎", "a b", "a/b", &"a".repeat(33)] {
            assert!(validate_user_id(value).is_err(), "{value}");
        }
    }

    #[test]
    fn validate_password_checks_length() {
        assert!(validate_password("1234567").is_err());
        assert!(validate_password("12345678").is_ok());
        assert!(validate_password(&"a".repeat(129)).is_err());
    }

    #[test]
    fn validate_display_name_trims() {
        assert!(validate_display_name("  ").is_err());
        assert!(validate_display_name(" 太郎 ").is_ok());
        assert!(validate_display_name(&"あ".repeat(31)).is_err());
    }
}
