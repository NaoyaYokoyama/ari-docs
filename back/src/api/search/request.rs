use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryWordRequest {
    pub word: String,
}

// 検索の対象外（FN0202-BR16）
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExclusionCreateRequest {
    // 全員の対象外にする（そうでなければ本人だけ）
    pub for_all: bool,
    // 'path' / 'name'
    pub kind: String,
    pub value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExclusionDeleteRequest {
    pub exclusion_id: String,
}
