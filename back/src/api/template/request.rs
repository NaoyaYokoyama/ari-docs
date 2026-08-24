use serde::Deserialize;
use validator::Validate;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateQuery {
    pub template_id: String,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSampleRequest {
    // 必須 + 最大文字数
    #[validate(length(min = 1, max = 100))]
    pub name: String,

    // 最小 + 最大文字数
    #[validate(length(min = 8, max = 100))]
    pub password: String,

    // メールアドレス
    #[validate(email)]
    pub email: String,

    // URL
    #[validate(url)]
    pub url: String,

    // 数値範囲
    #[validate(range(min = 0, max = 100))]
    pub number: i64,

    // 任意項目
    #[validate(length(max = 500))]
    pub description: Option<String>,

    // 独自バリデーション
    #[validate(custom(function = "validate_code"))]
    pub code: String,
}
