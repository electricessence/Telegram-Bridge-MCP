//! ask — sends a question and waits for a text reply.
//! Mirrors src/tools/ask.ts.

use frankenstein::{AsyncTelegramApi, ParseMode};
use frankenstein::methods::SendMessageParams;
use frankenstein::types::ReplyParameters;
use frankenstein::updates::UpdateContent;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::markdown::markdown_to_v2;
use crate::telegram::{
    call_api, frank_to_tool_result, get_api, make_chat_id, poll_until, resolve_chat, to_error,
    to_result, validate_text,
};
use crate::typing_state::cancel_typing;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AskParams {
    /// The question to send
    pub question: String,

    /// Reply to this message ID
    pub reply_to_message_id: Option<i32>,

    /// Seconds to wait for a reply before returning timed_out: true
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
}

fn default_timeout() -> u64 { 60 }

pub async fn impl_ask(params: AskParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let text = markdown_to_v2(&params.question);
    if let Some(err) = validate_text(&text) {
        return to_error(&err);
    }

    cancel_typing().await;

    let mut send_params = SendMessageParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .text(text)
        .parse_mode(ParseMode::MarkdownV2)
        .build();

    if let Some(reply_id) = params.reply_to_message_id {
        send_params.reply_parameters = Some(
            ReplyParameters::builder().message_id(reply_id).build(),
        );
    }

    let sent = match call_api(|| get_api().send_message(&send_params)).await {
        Ok(resp) => resp.result,
        Err(e) => return frank_to_tool_result(e),
    };
    let sent_id = sent.message_id;

    // Wait for a text reply
    let result = poll_until(
        |updates| {
            for u in updates {
                if let UpdateContent::Message(msg) = &u.content {
                    if let Some(reply_text) = &msg.text {
                        if let Some(reply_to) = &msg.reply_to_message {
                            if reply_to.message_id == sent_id {
                                return Some(reply_text.clone());
                            }
                        }
                    }
                }
            }
            None
        },
        params.timeout_seconds,
    ).await;

    if let Some(reply_text) = result.matched {
        to_result(&serde_json::json!({ "reply": reply_text }))
    } else {
        to_result(&serde_json::json!({ "timed_out": true }))
    }
}
