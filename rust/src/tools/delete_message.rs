//! delete_message — deletes a message in the configured chat.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::DeleteMessageParams;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DeleteMessageToolParams {
    /// ID of the message to delete
    pub message_id: i32,
}

pub async fn impl_delete_message(params: DeleteMessageToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let del_params = DeleteMessageParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .message_id(params.message_id)
        .build();

    match call_api(|| get_api().delete_message(&del_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "ok": resp.result })),
        Err(e) => frank_to_tool_result(e),
    }
}
