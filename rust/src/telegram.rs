//! Telegram API client wrapper, structured error types, constants, and helpers.
//! Mirrors src/telegram.ts in the TypeScript codebase.

use frankenstein::{AsyncTelegramApi, Error as FrankError};
use frankenstein::client_reqwest::Bot;
use frankenstein::updates::{Update, UpdateContent};
use frankenstein::types::{AllowedUpdate, MaybeInaccessibleMessage};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tokio::sync::Mutex;

// ---------------------------------------------------------------------------
// Telegram limits
// ---------------------------------------------------------------------------

pub const MESSAGE_TEXT_LIMIT: usize = 4096;
pub const CAPTION_LIMIT: usize = 1024;
pub const CALLBACK_DATA_LIMIT: usize = 64;
pub const BUTTON_TEXT_LIMIT: usize = 64;
pub const BUTTON_DISPLAY_MULTI_COL: usize = 20;
pub const BUTTON_DISPLAY_SINGLE_COL: usize = 35;
pub const INLINE_KEYBOARD_ROWS: usize = 8;
pub const INLINE_KEYBOARD_COLS: usize = 8;

pub const DEFAULT_ALLOWED_UPDATES: &[AllowedUpdate] = &[
    AllowedUpdate::Message,
    AllowedUpdate::CallbackQuery,
    AllowedUpdate::MyChatMember,
    AllowedUpdate::MessageReaction,
];

// ---------------------------------------------------------------------------
// Structured error type that agents can act on
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<String>,
}

impl TelegramError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self { code: code.into(), message: message.into(), retry_after: None, raw: None }
    }

    pub fn with_raw(mut self, raw: impl Into<String>) -> Self {
        self.raw = Some(raw.into());
        self
    }

    pub fn with_retry(mut self, secs: u32) -> Self {
        self.retry_after = Some(secs);
        self
    }
}

pub fn classify_frank_error(err: &FrankError) -> TelegramError {
    match err {
        FrankError::Api(api_err) => {
            let desc = api_err.description.to_lowercase();
            let raw = api_err.description.clone();
            let code_num = api_err.error_code;

            if desc.contains("message is too long") {
                return TelegramError::new("MESSAGE_TOO_LONG",
                    format!("Message text exceeds {MESSAGE_TEXT_LIMIT} characters. Shorten the text before sending."))
                    .with_raw(raw);
            }
            if desc.contains("caption is too long") {
                return TelegramError::new("CAPTION_TOO_LONG",
                    format!("Caption exceeds {CAPTION_LIMIT} characters. Shorten the caption before sending."))
                    .with_raw(raw);
            }
            if desc.contains("message text is empty") || desc.contains("text must be non-empty") {
                return TelegramError::new("EMPTY_MESSAGE",
                    "Message text is empty. Provide a non-empty string.")
                    .with_raw(raw);
            }
            if desc.contains("can't parse") {
                return TelegramError::new("PARSE_MODE_INVALID",
                    "Telegram could not parse the message with the given parse_mode. Check for unclosed HTML tags or unescaped MarkdownV2 characters.")
                    .with_raw(raw);
            }
            if desc.contains("chat not found") {
                return TelegramError::new("CHAT_NOT_FOUND",
                    "Chat not found. Verify the chat_id is correct and the bot has been added to the chat.")
                    .with_raw(raw);
            }
            if desc.contains("user not found") {
                return TelegramError::new("USER_NOT_FOUND",
                    "User not found. Verify the user_id is correct.")
                    .with_raw(raw);
            }
            if desc.contains("bot was blocked") || desc.contains("bot was kicked") {
                return TelegramError::new("BOT_BLOCKED",
                    "The user has blocked the bot. The message cannot be delivered.")
                    .with_raw(raw);
            }
            if desc.contains("not enough rights") || desc.contains("have no rights") || desc.contains("need administrator") {
                return TelegramError::new("NOT_ENOUGH_RIGHTS",
                    "The bot lacks the required permissions in this chat. Grant the bot admin rights.")
                    .with_raw(raw);
            }
            if desc.contains("message to edit not found") {
                return TelegramError::new("MESSAGE_NOT_FOUND",
                    "The message to edit was not found. It may have been deleted.")
                    .with_raw(raw);
            }
            if desc.contains("message can't be edited") {
                return TelegramError::new("MESSAGE_CANT_BE_EDITED",
                    "This message cannot be edited. Only messages sent by the bot within 48 hours can be edited.")
                    .with_raw(raw);
            }
            if desc.contains("message can't be deleted") || desc.contains("message to delete not found") {
                return TelegramError::new("MESSAGE_CANT_BE_DELETED",
                    "This message cannot be deleted. The bot may lack permissions, or the message is too old.")
                    .with_raw(raw);
            }
            if code_num == 429 {
                let retry = api_err.parameters
                    .as_ref()
                    .and_then(|p| p.retry_after)
                    .map(|v| v as u32);
                return TelegramError::new("RATE_LIMITED",
                    format!("Rate limited by Telegram. Retry after {} seconds.", retry.unwrap_or(5)))
                    .with_raw(raw)
                    .with_retry(retry.unwrap_or(5));
            }
            if desc.contains("button_data_invalid") || desc.contains("data is too long") {
                return TelegramError::new("BUTTON_DATA_INVALID",
                    format!("Inline button callback_data exceeds {CALLBACK_DATA_LIMIT} bytes. Shorten each button's data field."))
                    .with_raw(raw);
            }
            if desc.contains("privacy") || desc.contains("voice") || desc.contains("restricted") {
                return TelegramError::new("VOICE_RESTRICTED",
                    "Telegram blocked voice delivery — the user's privacy settings restrict voice notes from bots. \
                     To fix: Telegram → Settings → Privacy and Security → Voice Messages → Add Exceptions → Always Allow → add this bot.")
                    .with_raw(raw);
            }
            TelegramError::new("UNKNOWN",
                format!("Telegram API error {code_num}: {}", api_err.description))
                .with_raw(api_err.description.clone())
        }
        FrankError::HttpReqwest(e) => {
            TelegramError::new("UNKNOWN", format!("Network error reaching Telegram API: {e}"))
        }
        _ => {
            TelegramError::new("UNKNOWN", format!("Telegram error: {err}"))
        }
    }
}

// ---------------------------------------------------------------------------
// Singleton API client
// ---------------------------------------------------------------------------

static API: OnceLock<Bot> = OnceLock::new();

pub fn get_api() -> &'static Bot {
    API.get_or_init(|| {
        let token = std::env::var("BOT_TOKEN").unwrap_or_else(|_| {
            eprintln!("[telegram-bridge-mcp] Fatal: BOT_TOKEN environment variable is not set.");
            std::process::exit(1);
        });
        Bot::new(&token)
    })
}

// ---------------------------------------------------------------------------
// Security config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct SecurityConfig {
    pub user_id: Option<i64>,
    pub chat_id: Option<String>,
}

static SECURITY_CONFIG: OnceLock<SecurityConfig> = OnceLock::new();

pub fn get_security_config() -> &'static SecurityConfig {
    SECURITY_CONFIG.get_or_init(|| {
        let raw_user = std::env::var("ALLOWED_USER_ID").ok();
        let raw_chat = std::env::var("ALLOWED_CHAT_ID").ok();

        let user_id = raw_user.as_deref().and_then(|s| {
            s.trim().parse::<i64>().map_err(|_| {
                eprintln!(
                    "[telegram-bridge-mcp] WARNING: ALLOWED_USER_ID \"{s}\" is not a valid integer — user filter disabled."
                );
            }).ok()
        });

        if user_id.is_none() {
            eprintln!(
                "[telegram-bridge-mcp] WARNING: ALLOWED_USER_ID is not set. \
                 Any Telegram user who messages the bot can inject updates. \
                 Set ALLOWED_USER_ID to your numeric Telegram user ID."
            );
        }

        let chat_id = raw_chat.map(|s| s.trim().to_owned());
        SecurityConfig { user_id, chat_id }
    })
}

// ---------------------------------------------------------------------------
// Polling offset state (process-lifetime singleton)
// ---------------------------------------------------------------------------

static OFFSET: OnceLock<Mutex<i64>> = OnceLock::new();

fn offset_mutex() -> &'static Mutex<i64> {
    OFFSET.get_or_init(|| Mutex::new(0))
}

pub async fn get_offset() -> i64 {
    *offset_mutex().lock().await
}

pub async fn advance_offset(updates: &[Update]) {
    if updates.is_empty() { return; }
    let max_id = updates.iter().map(|u| u.update_id as i64).max().unwrap_or(0);
    let mut guard = offset_mutex().lock().await;
    *guard = max_id + 1;
}

pub async fn reset_offset() {
    *offset_mutex().lock().await = 0;
}

// ---------------------------------------------------------------------------
// Security filters
// ---------------------------------------------------------------------------

pub fn filter_allowed_updates(updates: Vec<Update>) -> Vec<Update> {
    let sec = get_security_config();
    if sec.user_id.is_none() && sec.chat_id.is_none() {
        return updates;
    }

    updates.into_iter().filter(|u| {
        let sender_id: Option<i64> = match &u.content {
            UpdateContent::Message(m) | UpdateContent::EditedMessage(m) => {
                m.from.as_ref().map(|f| f.id as i64)
            }
            UpdateContent::CallbackQuery(cq) => Some(cq.from.id as i64),
            _ => None,
        };

        let update_chat_id: Option<String> = match &u.content {
            UpdateContent::Message(m) | UpdateContent::EditedMessage(m) => {
                Some(m.chat.id.to_string())
            }
            UpdateContent::CallbackQuery(cq) => {
                cq.message.as_ref().map(|m| match m {
                    MaybeInaccessibleMessage::Message(msg) => msg.chat.id.to_string(),
                    MaybeInaccessibleMessage::InaccessibleMessage(im) => im.chat.id.to_string(),
                })
            }
            _ => None,
        };

        if let (Some(allowed), Some(sender)) = (sec.user_id, sender_id) {
            if sender != allowed { return false; }
        }
        if let (Some(ref allowed), Some(ref update_chat)) = (&sec.chat_id, &update_chat_id) {
            if update_chat.trim() != allowed.trim() { return false; }
        }
        true
    }).collect()
}

/// Resolves the target chat ID for all outbound tool calls.
pub fn resolve_chat() -> Result<String, TelegramError> {
    match &get_security_config().chat_id {
        Some(id) => Ok(id.clone()),
        None => Err(TelegramError::new(
            "UNAUTHORIZED_CHAT",
            "ALLOWED_CHAT_ID is not configured. Set it in your .env or MCP server config.",
        )),
    }
}

/// Validates that an outbound target chat is permitted.
pub fn validate_target_chat(chat_id: &str) -> Option<TelegramError> {
    let sec = get_security_config();
    match &sec.chat_id {
        Some(allowed) if chat_id.trim() != allowed.trim() => Some(TelegramError::new(
            "UNAUTHORIZED_CHAT",
            format!("Operation rejected: chat {chat_id} is not the configured ALLOWED_CHAT_ID."),
        )),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Pre-send validators
// ---------------------------------------------------------------------------

pub fn validate_text(text: &str) -> Option<TelegramError> {
    if text.trim().is_empty() {
        return Some(TelegramError::new("EMPTY_MESSAGE", "Message text must not be empty."));
    }
    if text.len() > MESSAGE_TEXT_LIMIT {
        return Some(TelegramError::new("MESSAGE_TOO_LONG",
            format!("Message text is {} chars but the Telegram limit is {MESSAGE_TEXT_LIMIT}. \
                     Shorten by at least {} characters.",
                text.len(), text.len() - MESSAGE_TEXT_LIMIT)));
    }
    None
}

pub fn validate_caption(caption: &str) -> Option<TelegramError> {
    if caption.len() > CAPTION_LIMIT {
        return Some(TelegramError::new("CAPTION_TOO_LONG",
            format!("Caption is {} chars but the Telegram limit is {CAPTION_LIMIT}. \
                     Shorten by at least {} characters.",
                caption.len(), caption.len() - CAPTION_LIMIT)));
    }
    None
}

pub fn validate_callback_data(data: &str) -> Option<TelegramError> {
    let byte_len = data.len(); // Telegram counts bytes
    if byte_len > CALLBACK_DATA_LIMIT {
        return Some(TelegramError::new("CALLBACK_DATA_TOO_LONG",
            format!("Callback data \"{data}\" is {byte_len} bytes but the Telegram limit is {CALLBACK_DATA_LIMIT} bytes.")));
    }
    None
}

// ---------------------------------------------------------------------------
// Message splitting
// ---------------------------------------------------------------------------

/// Splits text exceeding 4096 chars at paragraph/line/word boundaries.
pub fn split_message(text: &str) -> Vec<String> {
    if text.len() <= MESSAGE_TEXT_LIMIT {
        return vec![text.to_owned()];
    }

    let mut chunks = Vec::new();
    let mut remaining = text.to_owned();

    while remaining.len() > MESSAGE_TEXT_LIMIT {
        let limit = MESSAGE_TEXT_LIMIT;
        let split_at;

        // Prefer paragraph break (double newline)
        let para_at = remaining[..limit].rfind("\n\n");
        if let Some(pos) = para_at {
            if pos > limit / 2 {
                split_at = pos + 2;
            } else {
                // Single newline
                let nl_at = remaining[..limit].rfind('\n');
                if let Some(pos) = nl_at {
                    if pos > limit / 2 {
                        split_at = pos + 1;
                    } else {
                        // Word space
                        let sp_at = remaining[..limit].rfind(' ');
                        split_at = if let Some(pos) = sp_at { if pos > limit / 2 { pos + 1 } else { limit } } else { limit };
                    }
                } else {
                    let sp_at = remaining[..limit].rfind(' ');
                    split_at = if let Some(pos) = sp_at { if pos > limit / 2 { pos + 1 } else { limit } } else { limit };
                }
            }
        } else {
            let nl_at = remaining[..limit].rfind('\n');
            if let Some(pos) = nl_at {
                if pos > limit / 2 {
                    split_at = pos + 1;
                } else {
                    let sp_at = remaining[..limit].rfind(' ');
                    split_at = if let Some(pos) = sp_at { if pos > limit / 2 { pos + 1 } else { limit } } else { limit };
                }
            } else {
                let sp_at = remaining[..limit].rfind(' ');
                split_at = if let Some(pos) = sp_at { if pos > limit / 2 { pos + 1 } else { limit } } else { limit };
            }
        }

        let chunk = remaining[..split_at].trim_end().to_owned();
        chunks.push(chunk);
        remaining = remaining[split_at..].trim_start().to_owned();
    }

    if !remaining.is_empty() {
        chunks.push(remaining);
    }
    chunks
}

// ---------------------------------------------------------------------------
// sendVoice via direct multipart (bypasses frankenstein to control MIME type)
// ---------------------------------------------------------------------------

#[derive(Debug, Default)]
pub struct SendVoiceOptions {
    pub caption: Option<String>,
    pub parse_mode: Option<String>,
    pub duration: Option<u32>,
    pub disable_notification: Option<bool>,
    pub reply_to_message_id: Option<i32>,
}

pub async fn send_voice_direct(
    chat_id: &str,
    voice: Vec<u8>,
    opts: SendVoiceOptions,
) -> Result<serde_json::Value, TelegramError> {
    let token = std::env::var("BOT_TOKEN")
        .map_err(|_| TelegramError::new("UNKNOWN", "BOT_TOKEN not set"))?;

    let form = {
        let mut f = reqwest::multipart::Form::new()
            .text("chat_id", chat_id.to_owned());

        let part = reqwest::multipart::Part::bytes(voice)
            .file_name("voice.ogg")
            .mime_str("audio/ogg")
            .map_err(|e| TelegramError::new("UNKNOWN", e.to_string()))?;
        f = f.part("voice", part);

        if let Some(cap) = opts.caption { f = f.text("caption", cap); }
        if let Some(pm) = opts.parse_mode { f = f.text("parse_mode", pm); }
        if let Some(dur) = opts.duration { f = f.text("duration", dur.to_string()); }
        if opts.disable_notification == Some(true) { f = f.text("disable_notification", "true"); }
        if let Some(reply_id) = opts.reply_to_message_id {
            f = f.text("reply_parameters",
                serde_json::json!({ "message_id": reply_id }).to_string());
        }
        f
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("https://api.telegram.org/bot{token}/sendVoice"))
        .multipart(form)
        .send()
        .await
        .map_err(|e| TelegramError::new("UNKNOWN", e.to_string()))?;

    let json: serde_json::Value = resp.json().await
        .map_err(|e| TelegramError::new("UNKNOWN", e.to_string()))?;

    if json["ok"].as_bool() != Some(true) {
        let desc = json["description"].as_str().unwrap_or("unknown error").to_owned();
        let code = json["error_code"].as_u64().unwrap_or(0);
        if desc.to_lowercase().contains("privacy") || desc.to_lowercase().contains("restricted") {
            return Err(TelegramError::new("VOICE_RESTRICTED",
                "Telegram blocked voice delivery — the user's privacy settings restrict voice notes from bots. \
                 To fix: Telegram → Settings → Privacy and Security → Voice Messages → Add Exceptions → Always Allow → add this bot.")
                .with_raw(desc));
        }
        return Err(TelegramError::new("UNKNOWN",
            format!("Telegram API error {code}: {desc}"))
            .with_raw(desc));
    }

    Ok(json["result"].clone())
}

// ---------------------------------------------------------------------------
// callApi with automatic rate-limit retry
// ---------------------------------------------------------------------------

pub async fn call_api<T, Fut, F>(f: F) -> Result<T, FrankError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, FrankError>>,
{
    let max_retries = 3u32;
    let mut attempt = 0;
    loop {
        match f().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                if attempt < max_retries {
                    if let FrankError::Api(ref api_err) = e {
                        if api_err.error_code == 429 {
                            let delay = api_err.parameters
                                .as_ref()
                                .and_then(|p| p.retry_after)
                                .map(|v| v as u64)
                                .unwrap_or(5)
                                .min(60);
                            tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                            attempt += 1;
                            continue;
                        }
                    }
                }
                return Err(e);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// MCP response helpers  
// ---------------------------------------------------------------------------

use rmcp::model::{CallToolResult, Content};

pub fn to_result<T: Serialize>(data: &T) -> CallToolResult {
    CallToolResult::success(vec![Content::text(
        serde_json::to_string_pretty(data).unwrap_or_else(|_| "{}".to_owned()),
    )])
}

pub fn to_error(err: &TelegramError) -> CallToolResult {
    CallToolResult::error(vec![Content::text(
        serde_json::to_string_pretty(err).unwrap_or_else(|_| "{}".to_owned()),
    )])
}

pub fn frank_to_tool_result(err: FrankError) -> CallToolResult {
    to_error(&classify_frank_error(&err))
}

// ---------------------------------------------------------------------------
// pollUntil — shared polling helper
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct PollResult<T> {
    pub matched: Option<T>,
    pub missed: Vec<Update>,
}

/// Polls getUpdates with 1-second ticks until `matcher` returns Some or timeout.
pub async fn poll_until<T, F>(
    matcher: F,
    timeout_seconds: u64,
) -> PollResult<T>
where
    T: Send,
    F: Fn(&[Update]) -> Option<T>,
{
    use frankenstein::methods::GetUpdatesParams;

    let deadline = tokio::time::Instant::now()
        + tokio::time::Duration::from_secs(timeout_seconds);
    let mut missed: Vec<Update> = Vec::new();

    while tokio::time::Instant::now() < deadline {
        let offset = get_offset().await;
        let params = GetUpdatesParams::builder()
            .offset(offset)
            .limit(1u32)
            .timeout(25u32)
            .allowed_updates(DEFAULT_ALLOWED_UPDATES.to_vec())
            .build();

        let updates = match get_api().get_updates(&params).await {
            Ok(resp) => resp.result,
            Err(_) => {
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                continue;
            }
        };

        advance_offset(&updates).await;
        let allowed = filter_allowed_updates(updates);

        if let Some(result) = matcher(&allowed) {
            // Collect non-matching updates as missed
            for u in &allowed {
                if matcher(std::slice::from_ref(u)).is_none() {
                    missed.push(u.clone());
                }
            }
            return PollResult { matched: Some(result), missed };
        }

        missed.extend(allowed);
    }

    PollResult { matched: None, missed }
}

// ---------------------------------------------------------------------------
// Chat ID helper
// ---------------------------------------------------------------------------

pub fn make_chat_id(s: &str) -> frankenstein::types::ChatId {
    if let Ok(n) = s.trim().parse::<i64>() {
        frankenstein::types::ChatId::Integer(n)
    } else {
        frankenstein::types::ChatId::String(s.trim().to_owned())
    }
}
