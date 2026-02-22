//! get_chat — retrieves info about the configured chat.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::GetChatParams;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetChatToolParams {}

pub async fn impl_get_chat(_params: GetChatToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let get_params = GetChatParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .build();

    match call_api(|| get_api().get_chat(&get_params)).await {
        Ok(resp) => to_result(&resp.result),
        Err(e) => frank_to_tool_result(e),
    }
}
