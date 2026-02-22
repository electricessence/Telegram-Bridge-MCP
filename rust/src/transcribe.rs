//! Speech-to-text (Whisper) — stub for Rust port.
//!
//! Full STT uses whisper-rs (whisper.cpp bindings).
//! This stub enables a clean build; STT can be wired in later.

/// Transcribes a Telegram voice message file_id.
/// Stub — returns a placeholder message until implemented.
pub async fn transcribe(_file_id: &str) -> Result<String, String> {
    Err("STT (Whisper) not yet implemented in Rust port.".to_owned())
}

/// Transcribes a voice message while showing a typing indicator.
pub async fn transcribe_with_indicator(file_id: &str, _message_id: i32) -> Result<String, String> {
    transcribe(file_id).await
}
