//! Speech-to-text transcription.
//!
//! Two providers, selected by env vars:
//!
//!   Local (preferred, offline):
//!     WHISPER_MODEL_PATH  — path to a whisper.cpp .bin/.gguf model file.
//!                           Build with --features local-whisper (needs cmake + MSYS2 ucrt64).
//!                           Model download: https://huggingface.co/ggerganov/whisper.cpp
//!
//!   OpenAI API (fallback):
//!     OPENAI_API_KEY      — uses the OpenAI /v1/audio/transcriptions (whisper-1) endpoint.
//!     WHISPER_MODEL       — optional override, default: whisper-1
//!
//! Audio flow (both providers):
//!   1. Resolve Telegram file_path via getFile API.
//!   2. Download OGG/Opus audio bytes from Telegram CDN.
//!   3. Local: decode OGG/Opus → PCM f32 16kHz → whisper-rs (whisper.cpp)
//!      API:   POST multipart/form-data to OpenAI /v1/audio/transcriptions
//!   4. Return trimmed transcript text.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::GetFileParams;
use frankenstein::methods::SetMessageReactionParams;
use frankenstein::types::{ReactionType, ReactionTypeEmoji};

use crate::telegram::{call_api, get_api, make_chat_id, resolve_chat};

const DEFAULT_WHISPER_API_MODEL: &str = "whisper-1";
/// Whisper expects monaural PCM at 16 kHz.
#[cfg(feature = "local-whisper")]
const WHISPER_SAMPLE_RATE: u32 = 16000;

// ---------------------------------------------------------------------------
// Audio download
// ---------------------------------------------------------------------------

/// Downloads a Telegram file by file_id and returns the raw bytes plus the
/// Telegram file_path (used to guess the filename / codec).
async fn download_telegram_audio(file_id: &str) -> Result<(Vec<u8>, String), String> {
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
        return Err(format!("Audio download HTTP {}", resp.status().as_u16()));
    }

    let bytes = resp
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("Failed to read audio bytes: {e}"))?;

    Ok((bytes, file_path))
}

// ---------------------------------------------------------------------------
// Local provider — whisper-rs (whisper.cpp) + OGG/Opus decode via symphonia
// ---------------------------------------------------------------------------

#[cfg(feature = "local-whisper")]
fn decode_ogg_opus_to_pcm(ogg_bytes: &[u8]) -> Result<Vec<f32>, String> {
    use ogg::reading::PacketReader;
    use std::io::Cursor;

    // OGG/Opus from Telegram:  first packet = OpusHead, second = OpusTags,
    // remaining = audio packets.
    let mut packet_reader = PacketReader::new(Cursor::new(ogg_bytes));

    let mut opus_decoder: Option<audiopus::coder::Decoder> = None;
    let mut pcm_out: Vec<f32> = Vec::new();
    let mut packet_index = 0usize;

    loop {
        match packet_reader.read_packet() {
            Ok(Some(pkt)) => {
                // Skip OpusHead (pkt 0) and OpusTags (pkt 1)
                if packet_index < 2 {
                    if packet_index == 0 {
                        // Initialise decoder — Opus fixed at 48 kHz stereo from Telegram
                        let dec = audiopus::coder::Decoder::new(
                            audiopus::SampleRate::Hz48000,
                            audiopus::Channels::Stereo,
                        )
                        .map_err(|e| format!("audiopus init error: {e}"))?;
                        opus_decoder = Some(dec);
                    }
                    packet_index += 1;
                    continue;
                }

                let dec = opus_decoder.as_mut()
                    .ok_or("Decoder not initialised")?;

                // Each Opus frame = 20 ms at 48 kHz = 960 samples/ch × 2 ch = 1920 samples
                // Allocate generously; audiopus writes the actual count.
                let mut frame_buf = vec![0i16; 5760 * 2]; // up to 120 ms × 2 ch
                let packet = audiopus::packet::Packet::try_from(pkt.data.as_slice())
                    .map_err(|e| format!("Packet error: {e}"))?;
                let out_signals = audiopus::MutSignals::try_from(&mut frame_buf)
                    .map_err(|e| format!("MutSignals error: {e}"))?;
                let samples = dec
                    .decode(Some(packet), out_signals, false)
                    .map_err(|e| format!("Opus decode error: {e}"))?;

                // Convert interleaved stereo i16 → mono f32 at 48 kHz
                for i in 0..samples {
                    let l = frame_buf[i * 2] as f32 / 32768.0;
                    let r = frame_buf[i * 2 + 1] as f32 / 32768.0;
                    pcm_out.push((l + r) * 0.5);
                }

                packet_index += 1;
            }
            Ok(None) => break,
            Err(e) => return Err(format!("OGG read error: {e}")),
        }
    }

    if pcm_out.is_empty() {
        return Err("No audio decoded from OGG stream".to_owned());
    }

    // Downsample 48 kHz → 16 kHz (factor 3, simple decimation — acceptable for speech)
    let ratio = 48000usize / WHISPER_SAMPLE_RATE as usize; // = 3
    let resampled: Vec<f32> = pcm_out.iter().step_by(ratio).copied().collect();
    Ok(resampled)
}

#[cfg(feature = "local-whisper")]
fn whisper_local(pcm_16k: Vec<f32>) -> Result<String, String> {
    use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

    let model_path = std::env::var("WHISPER_MODEL_PATH").map_err(|_| {
        "WHISPER_MODEL_PATH must be set to a whisper.cpp .bin/.gguf model file when using \
         local transcription. Download from: \
         https://huggingface.co/ggerganov/whisper.cpp/tree/main"
            .to_owned()
    })?;

    // Load context on every call — no global state so tests stay isolated.
    // A production optimisation would cache this in a OnceLock.
    let ctx = WhisperContext::new_with_params(&model_path, WhisperContextParameters::default())
        .map_err(|e| format!("Failed to load Whisper model from {model_path:?}: {e}"))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(num_cpus::get().min(4) as i32);
    params.set_language(Some("auto"));
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let mut state = ctx
        .create_state()
        .map_err(|e| format!("Failed to create Whisper state: {e}"))?;

    state
        .full(params, &pcm_16k)
        .map_err(|e| format!("Whisper inference failed: {e}"))?;

    let mut text = String::new();
    for segment in state.as_iter() {
        let seg_text = segment.to_string();
        if !seg_text.trim().is_empty() {
            if !text.is_empty() { text.push(' '); }
            text.push_str(seg_text.trim());
        }
    }

    Ok(text.trim().to_owned())
}

// ---------------------------------------------------------------------------
// OpenAI API fallback
// ---------------------------------------------------------------------------

async fn whisper_api(audio_bytes: Vec<u8>, file_path: &str) -> Result<String, String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "Transcription requires OPENAI_API_KEY (or build with --features local-whisper and set WHISPER_MODEL_PATH).".to_owned())?;

    let model = std::env::var("WHISPER_MODEL")
        .unwrap_or_else(|_| DEFAULT_WHISPER_API_MODEL.to_owned());

    let ext = std::path::Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("ogg");
    let filename = format!("voice.{ext}");

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

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse Whisper response: {e}"))?
        ["text"]
        .as_str()
        .map(|s| s.trim().to_owned())
        .ok_or_else(|| "Whisper response missing 'text' field".to_owned())
}

// ---------------------------------------------------------------------------
// Reaction helper
// ---------------------------------------------------------------------------

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
///
/// Provider selection:
///   - `local-whisper` feature + `WHISPER_MODEL_PATH` set → local whisper.cpp (offline)
///   - Otherwise → OpenAI Whisper API (`OPENAI_API_KEY` required)
pub async fn transcribe(file_id: &str) -> Result<String, String> {
    let (audio_bytes, file_path) = download_telegram_audio(file_id).await?;

    #[cfg(feature = "local-whisper")]
    if std::env::var("WHISPER_MODEL_PATH").is_ok() {
        let pcm = decode_ogg_opus_to_pcm(&audio_bytes)?;
        return tokio::task::spawn_blocking(move || whisper_local(pcm))
            .await
            .map_err(|e| format!("Whisper thread panic: {e}"))?;
    }

    whisper_api(audio_bytes, &file_path).await
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
    use std::sync::OnceLock;

    static TEST_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    fn test_lock() -> &'static tokio::sync::Mutex<()> {
        TEST_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
    }

    #[tokio::test]
    async fn api_fallback_requires_api_key() {
        let _g = test_lock().lock().await;
        std::env::remove_var("OPENAI_API_KEY");
        #[cfg(feature = "local-whisper")]
        std::env::remove_var("WHISPER_MODEL_PATH");
        // whisper_api is an internal function we can call directly
        let result = whisper_api(vec![0u8; 4], "voice.ogg").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("OPENAI_API_KEY"));
    }

    #[cfg(feature = "local-whisper")]
    #[tokio::test]
    async fn local_path_requires_model_path() {
        let _g = test_lock().lock().await;
        std::env::remove_var("WHISPER_MODEL_PATH");
        let result = whisper_local(vec![0.0f32; 100]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("WHISPER_MODEL_PATH"));
    }
}
