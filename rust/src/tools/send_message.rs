//! send_message — sends text (or voice via TTS) to the configured chat.
//! Mirrors src/tools/send_message.ts.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::markdown::markdown_to_v2;
use crate::telegram::{
    call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, send_voice_direct,
    split_message, to_error, to_result, validate_text, SendVoiceOptions,
};
use crate::topic_state::apply_topic_to_text;
use crate::tts::{is_tts_enabled, synthesize_to_ogg};
use crate::typing_state::cancel_typing;
use frankenstein::{AsyncTelegramApi, ParseMode};
use frankenstein::methods::SendMessageParams;
use frankenstein::types::ReplyParameters;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SendMessageToolParams {
    /// Message text. Automatically split into multiple messages if longer than 4096 characters.
    pub text: String,

    /// Markdown = standard Markdown auto-converted (default); MarkdownV2 = raw; HTML = HTML tags
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,

    /// Send message silently
    pub disable_notification: Option<bool>,

    /// Reply to this message ID
    pub reply_to_message_id: Option<i32>,

    /// Send as spoken voice note via TTS. Defaults to true when TTS is configured.
    pub voice: Option<bool>,
}

fn default_parse_mode() -> String {
    "Markdown".to_owned()
}

pub async fn impl_send_message(params: SendMessageToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let use_voice = params.voice.unwrap_or_else(is_tts_enabled);

    // ── Voice (TTS) mode ────────────────────────────────────────────────
    if use_voice {
        if let Some(err) = validate_text(&params.text) {
            return to_error(&err);
        }
        let plain = crate::markdown::strip_for_tts(&params.text);
        if plain.is_empty() {
            return to_error(&crate::telegram::TelegramError::new(
                "EMPTY_MESSAGE",
                "Message text is empty after stripping formatting for TTS.",
            ));
        }
        let chunks = split_message(&plain);
        cancel_typing().await;

        let mut message_ids: Vec<i32> = Vec::new();
        for (idx, chunk) in chunks.iter().enumerate() {
            match synthesize_to_ogg(chunk).await {
                Ok(ogg) => {
                    let opts = SendVoiceOptions {
                        disable_notification: params.disable_notification,
                        reply_to_message_id: if idx == 0 { params.reply_to_message_id } else { None },
                        ..Default::default()
                    };
                    match send_voice_direct(&chat_id, ogg, opts).await {
                        Ok(result) => {
                            if let Some(id) = result["message_id"].as_i64() {
                                message_ids.push(id as i32);
                            }
                        }
                        Err(e) => return to_error(&e),
                    }
                }
                Err(e) => {
                    return to_error(&crate::telegram::TelegramError::new("UNKNOWN", e));
                }
            }
        }
        return to_result(&serde_json::json!({ "message_ids": message_ids, "voice": true }));
    }

    // ── Text mode ────────────────────────────────────────────────────────
    let (processed_text, final_mode) = match params.parse_mode.as_str() {
        "Markdown" => (markdown_to_v2(&params.text), Some(ParseMode::MarkdownV2)),
        "HTML" => (params.text.clone(), Some(ParseMode::Html)),
        "MarkdownV2" => (params.text.clone(), Some(ParseMode::MarkdownV2)),
        _ => (params.text.clone(), None),
    };

    // Apply topic prefix
    let processed_text = apply_topic_to_text(&processed_text).await;

    if let Some(err) = validate_text(&processed_text) {
        return to_error(&err);
    }

    let chunks = split_message(&processed_text);
    cancel_typing().await;

    let mut message_ids: Vec<i32> = Vec::new();
    for (idx, chunk) in chunks.iter().enumerate() {
        let mut send_params = SendMessageParams::builder()
            .chat_id(make_chat_id(&chat_id))
            .text(chunk.clone())
            .build();

        if let Some(ref mode) = final_mode {
            send_params.parse_mode = Some(mode.clone());
        }
        if params.disable_notification == Some(true) {
            send_params.disable_notification = Some(true);
        }
        if idx == 0 {
            if let Some(reply_id) = params.reply_to_message_id {
                send_params.reply_parameters = Some(
                    ReplyParameters::builder().message_id(reply_id).build(),
                );
            }
        }

        match call_api(|| get_api().send_message(&send_params)).await {
            Ok(resp) => message_ids.push(resp.result.message_id),
            Err(e) => return frank_to_tool_result(e),
        }
    }

    to_result(&serde_json::json!({
        "message_id": message_ids.first().copied(),
        "message_ids": message_ids
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::telegram::{TelegramError, validate_text};

    #[test]
    fn validate_text_empty() {
        assert!(validate_text("").is_some());
        assert!(validate_text("   ").is_some());
    }

    #[test]
    fn validate_text_ok() {
        assert!(validate_text("hello").is_none());
    }

    #[test]
    fn split_message_short() {
        let chunks = split_message("hello");
        assert_eq!(chunks, vec!["hello"]);
    }

    #[test]
    fn split_message_long() {
        let long = "a ".repeat(2100); // 4200 chars
        let chunks = split_message(&long);
        assert_eq!(chunks.len(), 2);
        for chunk in &chunks {
            assert!(chunk.len() <= 4096);
        }
    }

    #[test]
    fn default_parse_mode_is_markdown() {
        assert_eq!(default_parse_mode(), "Markdown");
    }
}
