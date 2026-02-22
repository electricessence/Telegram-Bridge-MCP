//! send_video — sends a video to the configured chat.

use frankenstein::{AsyncTelegramApi, ParseMode};
use frankenstein::input_file::FileUpload;
use frankenstein::methods::SendVideoParams;
use frankenstein::types::ReplyParameters;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result, validate_caption};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SendVideoToolParams {
    /// Local file path, public HTTPS URL, or Telegram file_id
    pub video: String,
    pub caption: Option<String>,
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,
    pub duration: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub disable_notification: Option<bool>,
    pub reply_to_message_id: Option<i32>,
}

fn default_parse_mode() -> String { "Markdown".to_owned() }

pub async fn impl_send_video(params: SendVideoToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };
    if let Some(ref cap) = params.caption {
        if let Some(err) = validate_caption(cap) { return to_error(&err); }
    }

    let video = FileUpload::String(params.video);
    let final_mode = if params.parse_mode == "HTML" { ParseMode::Html } else { ParseMode::MarkdownV2 };

    let mut video_params = SendVideoParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .video(video)
        .parse_mode(final_mode)
        .build();

    if let Some(cap) = params.caption {
        let cap = if params.parse_mode == "Markdown" { crate::markdown::markdown_to_v2(&cap) } else { cap };
        video_params.caption = Some(cap);
    }
    if let Some(d) = params.duration { video_params.duration = Some(d); }
    if let Some(w) = params.width { video_params.width = Some(w); }
    if let Some(h) = params.height { video_params.height = Some(h); }
    if params.disable_notification == Some(true) { video_params.disable_notification = Some(true); }
    if let Some(reply_id) = params.reply_to_message_id {
        video_params.reply_parameters = Some(ReplyParameters::builder().message_id(reply_id).build());
    }

    match call_api(|| get_api().send_video(&video_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "message_id": resp.result.message_id })),
        Err(e) => frank_to_tool_result(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_parse_mode_is_markdown() {
        assert_eq!(default_parse_mode(), "Markdown");
    }
}
