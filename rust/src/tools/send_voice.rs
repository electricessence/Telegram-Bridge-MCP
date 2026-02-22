//! send_voice — sends a voice note to the configured chat.
//! Uses direct multipart POST to ensure correct audio/ogg MIME type.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{resolve_chat, send_voice_direct, to_error, to_result, SendVoiceOptions};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SendVoiceToolParams {
    /// Local file path, public HTTPS URL, or Telegram file_id
    pub voice: String,
    pub caption: Option<String>,
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,
    pub duration: Option<u32>,
    pub disable_notification: Option<bool>,
    pub reply_to_message_id: Option<i32>,
}

fn default_parse_mode() -> String { "Markdown".to_owned() }

pub async fn impl_send_voice(params: SendVoiceToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    // Load voice bytes if it's a local file
    let voice_data = if std::path::Path::new(&params.voice).exists() {
        match std::fs::read(&params.voice) {
            Ok(data) => data,
            Err(e) => return to_error(&crate::telegram::TelegramError::new(
                "UNKNOWN", format!("Failed to read voice file: {e}"))),
        }
    } else {
        // URL or file_id — send as string via form
        let token = std::env::var("BOT_TOKEN").unwrap_or_default();
        let form = reqwest::multipart::Form::new()
            .text("chat_id", chat_id.clone())
            .text("voice", params.voice);
        let client = reqwest::Client::new();
        let resp = match client
            .post(format!("https://api.telegram.org/bot{token}/sendVoice"))
            .multipart(form)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => return to_error(&crate::telegram::TelegramError::new("UNKNOWN", e.to_string())),
        };
        let json: serde_json::Value = match resp.json().await {
            Ok(j) => j,
            Err(e) => return to_error(&crate::telegram::TelegramError::new("UNKNOWN", e.to_string())),
        };
        if json["ok"].as_bool() != Some(true) {
            let desc = json["description"].as_str().unwrap_or("unknown").to_owned();
            return to_error(&crate::telegram::TelegramError::new("UNKNOWN", desc));
        }
        return to_result(&serde_json::json!({ "message_id": json["result"]["message_id"] }));
    };

    let opts = SendVoiceOptions {
        caption: params.caption,
        parse_mode: Some(if params.parse_mode == "Markdown" { "MarkdownV2".to_owned() } else { params.parse_mode }),
        duration: params.duration,
        disable_notification: params.disable_notification,
        reply_to_message_id: params.reply_to_message_id,
    };

    match send_voice_direct(&chat_id, voice_data, opts).await {
        Ok(result) => to_result(&serde_json::json!({ "message_id": result["message_id"] })),
        Err(e) => to_error(&e),
    }
}
