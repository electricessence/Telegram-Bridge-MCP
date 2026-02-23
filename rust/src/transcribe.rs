//! Speech-to-text — OpenAI Whisper API transcription.
//!
//! Mirrors src/transcribe.ts but uses the OpenAI Whisper REST API instead of
//! local ONNX (local ONNX requires ort + audio-decode which are not yet ported).
//!
//! Requires:
//!   OPENAI_API_KEY  — required for transcription.
//!   WHISPER_MODEL   — optional, OpenAI model name (default: whisper-1).
//!                     Set to "whisper-large-v3" etc. for higher accuracy.
//!
//! Audio flow:
//!   1. Resolve Telegram file_path via getFile API.
//!   2. Download audio bytes from Telegram CDN.
//!   3. POST multipart/form-data to OpenAI /v1/audio/transcriptions.
//!   4. Return trimmed transcript text.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::GetFileParams;
use frankenstein::methods::SetMessageReactionParams;
use frankenstein::types::{ReactionType, ReactionTypeEmoji};

use crate::telegram::{call_api, get_api, make_chat_id, resolve_chat};

const DEFAULT_WHISPER_MODEL: &str = "whisper-1";

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

/// Downloads a Telegram file by file_id and returns the raw bytes.
async fn download_telegram_audio(file_id: &str) -> Result<Vec<u8>, String> {
    let get_file_params = GetFileParams::builder()
        .file_id(file_id.to_owned())
        .build();

    let file_info = call_api(|| get_api().get_file(&get_file_params))
        .await
        .map(|r| r.result)
        .map_err(|e| format!("Telegram getFile error: {e:?}"))?;

    let file_path = file_info.file_path.ok_or("Telegram returned no file_path")?;
    let token = std::env::var("BOT_TOKEN").map_err(|_| "BOT_TOKEN not set")?;
    let url = format!("https://api.telegram.org/file/bot{token}/{file_path}");

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Audio download failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        return Err(format!("Audio download HTTP {status}"));
    }

    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Failed to read audio bytes: {e}"))
}

/// Sends audio bytes to OpenAI Whisper and returns the transcript text.
async fn whisper_transcribe(audio_bytes: Vec<u8>, file_id: &str) -> Result<String, String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "Transcription requires the OPENAI_API_KEY environment variable.".to_owned())?;

    let model = std::env::var("WHISPER_MODEL")
        .unwrap_or_else(|_| DEFAULT_WHISPER_MODEL.to_owned());

    // Guess a plausible filename — OpenAI uses the extension to detect codec.
    // Telegram voice messages are always OGG/Opus.
    let filename = format!("{}.ogg", &file_id[..file_id.len().min(8)]);

    let file_part = reqwest::multipart::Part::bytes(audio_bytes)
        .file_name(filename)
        .mime_str("audio/ogg")
        .map_err(|e| format!("MIME error: {e}"))?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", model);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(&api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Whisper API request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_else(|_| "(no body)".to_owned());
        return Err(format!("OpenAI Whisper API error {status}: {body}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Whisper response: {e}"))?;

    json["text"]
        .as_str()
        .map(|s| s.trim().to_owned())
        .ok_or_else(|| format!("Whisper response missing 'text' field: {json}"))
}

/// Sets an emoji reaction on a message — best-effort, errors are suppressed.
async fn set_reaction_silent(chat_id: &str, message_id: i32, emoji: &str) {
    let reaction = vec![ReactionType::Emoji(ReactionTypeEmoji { emoji: emoji.to_owned() })];
    let params = SetMessageReactionParams::builder()
        .chat_id(make_chat_id(chat_id))
        .message_id(message_id)
        .reaction(reaction)
        .build();
    let _ = get_api().set_message_reaction(&params).await;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Downloads a Telegram voice message by file_id and transcribes it.
/// Returns the trimmed transcript text.
pub async fn transcribe(file_id: &str) -> Result<String, String> {
    let audio_bytes = download_telegram_audio(file_id).await?;
    whisper_transcribe(audio_bytes, file_id).await
}

/// Reacts to the voice message with ✍ (transcribing), transcribes it,
/// then swaps the reaction to 🫡 (done). Returns the transcript.
/// Reaction calls are best-effort — transcription proceeds regardless.
pub async fn transcribe_with_indicator(file_id: &str, message_id: i32) -> Result<String, String> {
    let chat_id = resolve_chat().ok();

    if let Some(ref cid) = chat_id {
        set_reaction_silent(cid, message_id, "✍").await;
    }

    let result = transcribe(file_id).await;

    if let Some(ref cid) = chat_id {
        let done_emoji = if result.is_ok() { "🫡" } else { "😢" };
        set_reaction_silent(cid, message_id, done_emoji).await;
    }

    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_whisper_model_is_whisper_one() {
        std::env::remove_var("WHISPER_MODEL");
        let model = std::env::var("WHISPER_MODEL")
            .unwrap_or_else(|_| DEFAULT_WHISPER_MODEL.to_owned());
        assert_eq!(model, "whisper-1");
    }

    #[test]
    fn whisper_model_env_override() {
        std::env::set_var("WHISPER_MODEL", "whisper-large-v3");
        let model = std::env::var("WHISPER_MODEL")
            .unwrap_or_else(|_| DEFAULT_WHISPER_MODEL.to_owned());
        assert_eq!(model, "whisper-large-v3");
        std::env::remove_var("WHISPER_MODEL");
    }

    #[tokio::test]
    async fn whisper_transcribe_missing_api_key_err() {
        std::env::remove_var("OPENAI_API_KEY");
        let result = whisper_transcribe(vec![0u8; 4], "test1234").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("OPENAI_API_KEY"));
    }
}
