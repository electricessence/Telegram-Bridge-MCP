//! send_photo — sends a photo to the configured chat.

use frankenstein::{AsyncTelegramApi, ParseMode};
use frankenstein::methods::SendPhotoParams as FrankSendPhotoParams;
use frankenstein::types::ReplyParameters;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result, validate_caption};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SendPhotoToolParams {
    /// Local file path, public HTTPS URL, or Telegram file_id
    pub photo: String,

    /// Optional caption (up to 1024 chars)
    pub caption: Option<String>,

    /// Parse mode for the caption
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,

    /// Send silently
    pub disable_notification: Option<bool>,

    /// Reply to this message ID
    pub reply_to_message_id: Option<i32>,
}

fn default_parse_mode() -> String { "Markdown".to_owned() }

pub async fn impl_send_photo(params: SendPhotoToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    if let Some(ref cap) = params.caption {
        if let Some(err) = validate_caption(cap) {
            return to_error(&err);
        }
    }

    use frankenstein::input_file::FileUpload;
    let photo = FileUpload::String(params.photo);

    let final_mode = match params.parse_mode.as_str() {
        "Markdown" => ParseMode::MarkdownV2,
        "HTML" => ParseMode::Html,
        _ => ParseMode::MarkdownV2,
    };

    let mut photo_params = FrankSendPhotoParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .photo(photo)
        .parse_mode(final_mode)
        .build();

    if let Some(cap) = params.caption {
        let cap = if params.parse_mode == "Markdown" {
            crate::markdown::markdown_to_v2(&cap)
        } else { cap };
        photo_params.caption = Some(cap);
    }
    if params.disable_notification == Some(true) {
        photo_params.disable_notification = Some(true);
    }
    if let Some(reply_id) = params.reply_to_message_id {
        photo_params.reply_parameters = Some(
            ReplyParameters::builder().message_id(reply_id).build(),
        );
    }

    match call_api(|| get_api().send_photo(&photo_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "message_id": resp.result.message_id })),
        Err(e) => frank_to_tool_result(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::telegram::validate_caption;

    #[test]
    fn default_parse_mode_is_markdown() {
        assert_eq!(default_parse_mode(), "Markdown");
    }

    #[test]
    fn validate_caption_rejects_too_long() {
        let long = "x".repeat(1025);
        assert!(validate_caption(&long).is_some());
    }

    #[test]
    fn validate_caption_accepts_valid() {
        assert!(validate_caption("a nice caption").is_none());
    }
}
