//! wait_for_callback_query — blocks until a button is pressed.
//! Mirrors src/tools/wait_for_callback_query.ts.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{poll_until, resolve_chat, to_error, to_result};

use frankenstein::types::MaybeInaccessibleMessage;
use frankenstein::updates::UpdateContent;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WaitForCallbackQueryParams {
    /// Seconds to wait before returning timed_out: true
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
}

fn default_timeout() -> u64 { 60 }

pub async fn impl_wait_for_callback_query(params: WaitForCallbackQueryParams) -> CallToolResult {
    if let Err(e) = resolve_chat() {
        return to_error(&e);
    }

    let result = poll_until(
        |updates| {
            for u in updates {
                if let UpdateContent::CallbackQuery(cq) = &u.content {
                    let msg_id = cq.message.as_ref().map(|m| match m {
                        MaybeInaccessibleMessage::Message(msg) => msg.message_id,
                        MaybeInaccessibleMessage::InaccessibleMessage(im) => im.message_id,
                    });
                    return Some(serde_json::json!({
                        "type": "callback_query",
                        "callback_query_id": cq.id,
                        "data": cq.data,
                        "message_id": msg_id,
                    }));
                }
            }
            None
        },
        params.timeout_seconds,
    ).await;

    if let Some(cq) = result.matched {
        to_result(&cq)
    } else {
        to_result(&serde_json::json!({ "timed_out": true }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_timeout_is_60() {
        assert_eq!(default_timeout(), 60);
    }
}
