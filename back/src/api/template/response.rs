use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateResponse {
    pub templates: Vec<Template>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub template_id: i64,
    pub content: String,
}
