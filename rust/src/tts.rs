//! Text-to-speech — stub for Rust port.
//!
//! Full TTS (Kokoro/SpeechT5 ONNX) requires candle-transformers. 
//! This stub enables a clean build; TTS can be wired in later.

/// Returns true if TTS is enabled (TTS_PROVIDER set, or default local when unset).
pub fn is_tts_enabled() -> bool {
    // In the TS version, local TTS defaults to enabled.
    // In Rust, default to false until candle-based TTS is implemented.
    matches!(
        std::env::var("TTS_PROVIDER").as_deref(),
        Ok("local") | Ok("openai") | Ok("elevenlabs")
    )
}

/// Synthesizes text to an OGG/Opus buffer. Stub — returns an error until implemented.
pub async fn synthesize_to_ogg(_text: &str) -> Result<Vec<u8>, String> {
    Err("TTS not yet implemented in Rust port. Set TTS_PROVIDER=none to suppress voice.".to_owned())
}
