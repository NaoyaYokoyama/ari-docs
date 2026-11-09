use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiResponse {
    pub wikis: Vec<Wiki>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wiki {
    pub wiki_id: String,
    pub title: String,
    pub content: String,
    pub updated_at: String,
    pub favorite_id: String,
    // 最後に更新した人（まだ誰も更新していなければ作成者）の表示名。一覧では空文字（FN0501-BR09）
    pub updated_by: String,
}
