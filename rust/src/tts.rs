//! Text-to-speech synthesis module.
//!
//! Supported providers (TTS_PROVIDER env var):
//!
//!   openai  — High quality. Requires OPENAI_API_KEY.
//!             Env vars: TTS_VOICE (default: alloy), TTS_MODEL (default: tts-1)
//!
//!   local   — Free, zero API key. NOT YET IMPLEMENTED in the Rust port.
//!             (Requires ONNX runtime + OGG/Opus encoder; candle-transformers work in progress.)
//!
//! Returns OGG/Opus bytes — natively supported by Telegram sendVoice.

/// Returns true when TTS delivery is configured.
///
/// - `TTS_PROVIDER=openai` → true (OpenAI implemented)
/// - `TTS_PROVIDER=local` or unset → false until local ONNX pipeline is ported
pub fn is_tts_enabled() -> bool {
    matches!(
        std::env::var("TTS_PROVIDER").as_deref(),
        Ok("openai")
    )
}

/// Synthesizes plain text to OGG/Opus bytes.
///
/// Dispatches by `TTS_PROVIDER`. Input must already be stripped of formatting
/// (call `crate::markdown::strip_for_tts` first). Length must be ≤ 4096 chars.
pub async fn synthesize_to_ogg(text: &str) -> Result<Vec<u8>, String> {
    let provider = std::env::var("TTS_PROVIDER")
        .unwrap_or_default()
        .to_lowercase();

    match provider.as_str() {
        "openai" => synthesize_openai(text).await,
        "local" | "" => Err(
            "Local TTS is not yet implemented in the Rust port. \
             Set TTS_PROVIDER=openai and provide OPENAI_API_KEY to use TTS."
                .to_owned(),
        ),
        other => Err(format!("Unknown TTS_PROVIDER: {other:?}. Supported: openai")),
    }
}

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

async fn synthesize_openai(text: &str) -> Result<Vec<u8>, String> {
    let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| {
        "TTS_PROVIDER=openai requires the OPENAI_API_KEY environment variable to be set.".to_owned()
    })?;

    let voice = std::env::var("TTS_VOICE").unwrap_or_else(|_| "alloy".to_owned());
    let model = std::env::var("TTS_MODEL").unwrap_or_else(|_| "tts-1".to_owned());

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(&api_key)
        .json(&serde_json::json!({
            "model": model,
            "input": text,
            "voice": voice,
            "response_format": "opus"
        }))
        .send()
        .await
        .map_err(|e| format!("OpenAI TTS request failed: {e}"))?;

    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body = res.text().await.unwrap_or_else(|_| "(no body)".to_owned());
        return Err(format!("OpenAI TTS API error {status}: {body}"));
    }

    res.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Failed to read OpenAI TTS response body: {e}"))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;

    /// Serializes all TTS tests that mutate TTS_PROVIDER / OPENAI_API_KEY env vars.
    static TEST_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    fn test_lock() -> &'static tokio::sync::Mutex<()> {
        TEST_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
    }

    #[tokio::test]
    async fn is_tts_enabled_openai() {
        let _g = test_lock().lock().await;
        std::env::set_var("TTS_PROVIDER", "openai");
        assert!(is_tts_enabled());
        std::env::remove_var("TTS_PROVIDER");
    }

    #[tokio::test]
    async fn is_tts_enabled_local_not_yet() {
        let _g = test_lock().lock().await;
        std::env::set_var("TTS_PROVIDER", "local");
        assert!(!is_tts_enabled(), "local TTS is not implemented yet");
        std::env::remove_var("TTS_PROVIDER");
    }

    #[tokio::test]
    async fn is_tts_enabled_unset_false() {
        let _g = test_lock().lock().await;
        std::env::remove_var("TTS_PROVIDER");
        assert!(!is_tts_enabled(), "unset TTS_PROVIDER should be false until local is implemented");
    }

    #[tokio::test]
    async fn is_tts_enabled_none_false() {
        let _g = test_lock().lock().await;
        std::env::set_var("TTS_PROVIDER", "none");
        assert!(!is_tts_enabled());
        std::env::remove_var("TTS_PROVIDER");
    }

    #[tokio::test]
    async fn synthesize_unknown_provider_err() {
        let _g = test_lock().lock().await;
        std::env::set_var("TTS_PROVIDER", "elevenlabs");
        let result = synthesize_to_ogg("hello").await;
        std::env::remove_var("TTS_PROVIDER");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown TTS_PROVIDER"));
    }

    #[tokio::test]
    async fn synthesize_openai_missing_key_err() {
        let _g = test_lock().lock().await;
        std::env::set_var("TTS_PROVIDER", "openai");
        std::env::remove_var("OPENAI_API_KEY");
        let result = synthesize_to_ogg("hello").await;
        std::env::remove_var("TTS_PROVIDER");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("OPENAI_API_KEY"));
    }

    #[tokio::test]
    async fn synthesize_local_not_implemented_err() {
        let _g = test_lock().lock().await;
        std::env::set_var("TTS_PROVIDER", "local");
        let result = synthesize_to_ogg("hello").await;
        std::env::remove_var("TTS_PROVIDER");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not yet implemented"));
    }
}
