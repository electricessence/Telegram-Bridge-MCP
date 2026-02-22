//! update_status — edits the most recent status message, or sends a new one.
//! Mirrors the TypeScript update_status.ts tool.

use frankenstein::{AsyncTelegramApi, ParseMode};
use frankenstein::methods::{EditMessageTextParams, SendMessageParams};
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;
use std::sync::OnceLock;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result};

static LAST_STATUS_MESSAGE_ID: OnceLock<tokio::sync::Mutex<Option<i32>>> = OnceLock::new();

fn get_last_status_id() -> &'static tokio::sync::Mutex<Option<i32>> {
    LAST_STATUS_MESSAGE_ID.get_or_init(|| tokio::sync::Mutex::new(None))
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdateStatusParams {
    /// Status message body (supports Markdown)
    pub body: String,

    /// Short title/heading (will be bolded)
    pub title: Option<String>,

    /// Parse mode  
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,

    /// If true, sends a new message instead of editing
    pub force_new: Option<bool>,
}

fn default_parse_mode() -> String { "Markdown".to_owned() }

/// Combines optional title and body into the full status message text.
pub fn format_status_body(title: Option<&str>, body: &str) -> String {
    match title {
        Some(t) => format!("**{t}**\n{body}"),
        None => body.to_owned(),
    }
}

pub async fn impl_update_status(params: UpdateStatusParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let full_text = format_status_body(params.title.as_deref(), &params.body);

    let (converted, mode) = if params.parse_mode == "HTML" {
        (full_text, ParseMode::Html)
    } else {
        (crate::markdown::markdown_to_v2(&full_text), ParseMode::MarkdownV2)
    };

    // Try editing existing message first
    let existing_id = *get_last_status_id().lock().await;

    if existing_id.is_some() && params.force_new != Some(true) {
        let msg_id = existing_id.unwrap();
        let edit_params = EditMessageTextParams::builder()
            .chat_id(make_chat_id(&chat_id))
            .message_id(msg_id)
            .text(converted.clone())
            .parse_mode(mode)
            .build();

        match call_api(|| get_api().edit_message_text(&edit_params)).await {
            Ok(_) => return to_result(&serde_json::json!({ "message_id": msg_id, "updated": true })),
            Err(_) => {
                // Fall through to send new message
                *get_last_status_id().lock().await = None;
            }
        }
    }

    // Send new message
    let send_params = SendMessageParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .text(converted)
        .parse_mode(mode)
        .build();

    match call_api(|| get_api().send_message(&send_params)).await {
        Ok(resp) => {
            let new_id = resp.result.message_id;
            *get_last_status_id().lock().await = Some(new_id);
            to_result(&serde_json::json!({ "message_id": new_id, "updated": false }))
        }
        Err(e) => frank_to_tool_result(e),
    }
}

/// Reset the tracked status message ID (for testing)
pub async fn reset_status_message_id() {
    *get_last_status_id().lock().await = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_parse_mode_is_markdown() {
        assert_eq!(default_parse_mode(), "Markdown");
    }

    #[test]
    fn format_status_body_with_title() {
        let result = format_status_body(Some("Deploy"), "Build passed.");
        assert_eq!(result, "**Deploy**\nBuild passed.");
    }

    #[test]
    fn format_status_body_without_title() {
        let result = format_status_body(None, "Build passed.");
        assert_eq!(result, "Build passed.");
    }

    #[test]
    fn format_status_body_empty_body() {
        let result = format_status_body(Some("Title"), "");
        assert_eq!(result, "**Title**\n");
    }
}
