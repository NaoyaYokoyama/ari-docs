use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryWordRequest {
    pub word: String,
}
