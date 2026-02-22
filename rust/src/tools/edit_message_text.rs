//! edit_message_text — edits a previously sent message.
//! Mirrors src/tools/edit_message_text.ts.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::EditMessageTextParams as FrankEditTextParams;
use frankenstein::ParseMode;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::markdown::markdown_to_v2;
use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result, validate_text};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EditMessageTextToolParams {
    /// ID of the message to edit
    pub message_id: i32,

    /// New text content
    pub text: String,

    /// Markdown = standard Markdown auto-converted (default); MarkdownV2 = raw; HTML = HTML tags
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,
}

fn default_parse_mode() -> String { "Markdown".to_owned() }

pub async fn impl_edit_message_text(params: EditMessageTextToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let (text, final_mode) = match params.parse_mode.as_str() {
        "Markdown" => (markdown_to_v2(&params.text), Some(ParseMode::MarkdownV2)),
        "HTML" => (params.text.clone(), Some(ParseMode::Html)),
        "MarkdownV2" => (params.text.clone(), Some(ParseMode::MarkdownV2)),
        _ => (params.text.clone(), None),
    };

    if let Some(err) = validate_text(&text) {
        return to_error(&err);
    }

    let mut edit_params = FrankEditTextParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .message_id(params.message_id)
        .text(text)
        .build();

    if let Some(mode) = final_mode {
        edit_params.parse_mode = Some(mode);
    }

    match call_api(|| get_api().edit_message_text(&edit_params)).await {
        Ok(resp) => to_result(&serde_json::json!({
            "message_id": match resp.result {
                frankenstein::response::MessageOrBool::Message(m) => Some(m.message_id),
                frankenstein::response::MessageOrBool::Bool(_) => None,
            }
        })),
        Err(e) => frank_to_tool_result(e),
    }
}
