//! pin_message — pins a message in the configured chat.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::PinChatMessageParams;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PinMessageParams {
    /// ID of the message to pin
    pub message_id: i32,

    /// Disable notification for pinning
    pub disable_notification: Option<bool>,
}

pub async fn impl_pin_message(params: PinMessageParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let mut pin_params = PinChatMessageParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .message_id(params.message_id)
        .build();

    if params.disable_notification == Some(true) {
        pin_params.disable_notification = Some(true);
    }

    match call_api(|| get_api().pin_chat_message(&pin_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "ok": resp.result })),
        Err(e) => frank_to_tool_result(e),
    }
}
