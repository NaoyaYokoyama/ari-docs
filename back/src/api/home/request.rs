use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSearchRequest {
    pub keyword: String,
}
