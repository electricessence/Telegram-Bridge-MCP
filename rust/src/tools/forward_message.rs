//! forward_message — forwards a message to/within the configured chat.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::ForwardMessageParams;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ForwardMessageToolParams {
    /// ID of the message to forward
    pub message_id: i32,

    /// Source chat ID (defaults to the configured chat if omitted)
    pub from_chat_id: Option<String>,

    /// Disable notification
    pub disable_notification: Option<bool>,
}

pub async fn impl_forward_message(params: ForwardMessageToolParams) -> CallToolResult {
    let to_chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };
    let from_id = params.from_chat_id.as_deref().unwrap_or(&to_chat_id).to_owned();

    let mut fwd_params = ForwardMessageParams::builder()
        .chat_id(make_chat_id(&to_chat_id))
        .from_chat_id(make_chat_id(&from_id))
        .message_id(params.message_id)
        .build();

    if params.disable_notification == Some(true) {
        fwd_params.disable_notification = Some(true);
    }

    match call_api(|| get_api().forward_message(&fwd_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "message_id": resp.result.message_id })),
        Err(e) => frank_to_tool_result(e),
    }
}
