//! Typing indicator state — async singleton.
//! Mirrors src/typing-state.ts.
//!
//! Design:
//! - Idempotent: calling show_typing() while active just extends the deadline.
//! - Auto-cancel: the spawned task aborts when the deadline passes.
//! - Send-cancel: outbound tools call cancel_typing() before sending.

use std::sync::OnceLock;
use tokio::sync::Mutex;
use tokio::task::AbortHandle;
use tokio::time::{Duration, Instant};

pub struct TypingState {
    pub deadline: Option<Instant>,
    pub abort_handle: Option<AbortHandle>,
}

impl TypingState {
    const fn new() -> Self {
        TypingState { deadline: None, abort_handle: None }
    }
}

static TYPING: OnceLock<Mutex<TypingState>> = OnceLock::new();

fn typing_mutex() -> &'static Mutex<TypingState> {
    TYPING.get_or_init(|| Mutex::new(TypingState::new()))
}

/// Cancel the typing indicator. Returns true if one was active.
pub async fn cancel_typing() -> bool {
    let mut guard = typing_mutex().lock().await;
    let was_active = guard.abort_handle.is_some();
    if let Some(handle) = guard.abort_handle.take() {
        handle.abort();
    }
    guard.deadline = None;
    was_active
}

/// Show the typing indicator for `timeout_seconds`.
/// Returns true if newly started, false if an existing one was extended.
pub async fn show_typing(timeout_seconds: u64) -> bool {
    let new_deadline = Instant::now() + Duration::from_secs(timeout_seconds);

    let mut guard = typing_mutex().lock().await;

    if guard.abort_handle.is_some() {
        // Already running — just extend the deadline
        guard.deadline = Some(std::cmp::max(guard.deadline.unwrap_or(new_deadline), new_deadline));
        return false;
    }

    guard.deadline = Some(new_deadline);
    drop(guard); // release before spawning

    // Spawn the repeating task
    let handle = tokio::spawn(typing_loop()).abort_handle();

    let mut guard = typing_mutex().lock().await;
    guard.abort_handle = Some(handle);
    true
}

async fn typing_loop() {
    const INTERVAL: Duration = Duration::from_secs(4);

    use crate::telegram::{get_api, resolve_chat};
    use frankenstein::AsyncTelegramApi;
    use frankenstein::methods::SendChatActionParams;

    loop {
        {
            let guard = typing_mutex().lock().await;
            if let Some(deadline) = guard.deadline {
                if Instant::now() >= deadline {
                    drop(guard);
                    // Self-cancel
                    let mut inner = typing_mutex().lock().await;
                    inner.abort_handle = None;
                    inner.deadline = None;
                    return;
                }
            } else {
                return;
            }
        }

        // Send typing action
        if let Ok(chat_id) = resolve_chat() {
            use crate::telegram::make_chat_id;
            let params = SendChatActionParams::builder()
                .chat_id(make_chat_id(&chat_id))
                .action(frankenstein::types::ChatAction::Typing)
                .build();
            let _ = get_api().send_chat_action(&params).await;
        }

        tokio::time::sleep(INTERVAL).await;
    }
}

/// For testing: reset the typing state.
#[cfg(test)]
pub async fn reset_typing() {
    let mut guard = typing_mutex().lock().await;
    if let Some(handle) = guard.abort_handle.take() {
        handle.abort();
    }
    guard.deadline = None;
}
