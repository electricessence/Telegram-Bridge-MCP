//! wait_for_message — blocks until a text message arrives.
//! Mirrors src/tools/wait_for_message.ts.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{poll_until, resolve_chat, to_error, to_result};

use frankenstein::updates::UpdateContent;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WaitForMessageParams {
    /// Seconds to wait before returning timed_out: true
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
}

fn default_timeout() -> u64 { 60 }

pub async fn impl_wait_for_message(params: WaitForMessageParams) -> CallToolResult {
    if let Err(e) = resolve_chat() {
        return to_error(&e);
    }

    let result = poll_until(
        |updates| {
            for u in updates {
                if let UpdateContent::Message(msg) = &u.content {
                    if let Some(text) = &msg.text {
                        return Some(serde_json::json!({
                            "type": "message",
                            "content_type": "text",
                            "message_id": msg.message_id,
                            "reply_to_message_id": msg.reply_to_message.as_ref().map(|r| r.message_id),
                            "text": text,
                        }));
                    }
                }
            }
            None
        },
        params.timeout_seconds,
    ).await;

    if let Some(msg) = result.matched {
        to_result(&msg)
    } else {
        to_result(&serde_json::json!({ "timed_out": true }))
    }
}
