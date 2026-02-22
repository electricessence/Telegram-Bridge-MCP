//! answer_callback_query — acknowledges an inline button press.
//! Mirrors src/tools/answer_callback_query.ts.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::AnswerCallbackQueryParams;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AnswerCallbackQueryToolParams {
    /// ID from the callback_query update
    pub callback_query_id: String,

    /// Toast notification text shown to the user (up to 200 chars)
    pub text: Option<String>,

    /// Show as a dialog alert instead of a toast
    pub show_alert: Option<bool>,

    /// Seconds the result may be cached client-side
    pub cache_time: Option<u32>,
}

pub async fn impl_answer_callback_query(params: AnswerCallbackQueryToolParams) -> CallToolResult {
    let mut answer_params = AnswerCallbackQueryParams::builder()
        .callback_query_id(params.callback_query_id)
        .build();

    if let Some(text) = params.text { answer_params.text = Some(text); }
    if let Some(show_alert) = params.show_alert { answer_params.show_alert = Some(show_alert); }
    if let Some(cache_time) = params.cache_time { answer_params.cache_time = Some(cache_time); }

    match call_api(|| get_api().answer_callback_query(&answer_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "ok": resp.result })),
        Err(e) => frank_to_tool_result(e),
    }
}
