//! choose — sends a message with inline keyboard buttons, waits for one to be pressed.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::SendMessageParams;
use frankenstein::types::{InlineKeyboardButton, InlineKeyboardMarkup, MaybeInaccessibleMessage, ReplyMarkup, ReplyParameters};
use frankenstein::updates::UpdateContent;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, poll_until, resolve_chat, to_error, to_result, validate_text};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ChoiceOption {
    pub label: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ChooseParams {
    /// The prompt question to display
    pub question: String,

    /// Array of options to present as inline buttons
    pub options: Vec<ChoiceOption>,

    /// Message ID to reply to
    pub reply_to_message_id: Option<i32>,

    /// Time to wait for a response in seconds (default 60)
    pub timeout_seconds: Option<u64>,
}

pub async fn impl_choose(params: ChooseParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    if let Some(err) = validate_text(&params.question) {
        return to_error(&err);
    }

    if params.options.is_empty() {
        return to_error(&crate::telegram::TelegramError::new("INVALID_PARAMS", "At least one option is required".to_owned()));
    }

    // Build inline keyboard — one button per row
    let buttons: Vec<Vec<InlineKeyboardButton>> = params.options
        .iter()
        .enumerate()
        .map(|(i, opt)| {
            let label = if let Some(ref desc) = opt.description {
                format!("{} — {}", opt.label, desc)
            } else {
                opt.label.clone()
            };
            vec![InlineKeyboardButton::builder()
                .text(label)
                .callback_data(format!("choice_{i}"))
                .build()]
        })
        .collect();

    let keyboard = InlineKeyboardMarkup::builder()
        .inline_keyboard(buttons)
        .build();

    let converted = crate::markdown::markdown_to_v2(&params.question);
    let mut send_params = SendMessageParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .text(converted)
        .parse_mode(frankenstein::ParseMode::MarkdownV2)
        .reply_markup(ReplyMarkup::InlineKeyboardMarkup(keyboard))
        .build();

    if let Some(reply_id) = params.reply_to_message_id {
        send_params.reply_parameters = Some(
            ReplyParameters::builder().message_id(reply_id).build(),
        );
    }

    let sent_msg = match call_api(|| get_api().send_message(&send_params)).await {
        Ok(resp) => resp.result,
        Err(e) => return frank_to_tool_result(e),
    };

    let question_msg_id = sent_msg.message_id;

    // Build set of valid callback_data values
    let valid_data: Vec<String> = (0..params.options.len()).map(|i| format!("choice_{i}")).collect();

    let timeout = params.timeout_seconds.unwrap_or(60);

    let result = poll_until(
        move |updates| {
            for update in updates {
                if let UpdateContent::CallbackQuery(cq) = &update.content {
                    if let Some(ref data) = cq.data {
                        if valid_data.contains(data) {
                            let cq_msg_id = cq.message.as_ref().map(|m| match m {
                                MaybeInaccessibleMessage::Message(msg) => msg.message_id,
                                MaybeInaccessibleMessage::InaccessibleMessage(im) => im.message_id,
                            });
                            if cq_msg_id == Some(question_msg_id) {
                                return Some(serde_json::json!({
                                    "callback_query_id": cq.id,
                                    "data": data,
                                    "from": cq.from,
                                }));
                            }
                        }
                    }
                }
            }
            None
        },
        timeout,
    ).await;

    if let Some(matched) = result.matched {
        let data = matched["data"].as_str().unwrap_or("");
        let idx: usize = data.strip_prefix("choice_").and_then(|s| s.parse().ok()).unwrap_or(0);
        let chosen_label = params.options.get(idx).map(|o| o.label.as_str()).unwrap_or("");
        to_result(&serde_json::json!({
            "chosen": chosen_label,
            "chosen_index": idx,
            "callback_query_id": matched["callback_query_id"],
            "from": matched["from"],
        }))
    } else {
        to_result(&serde_json::json!({ "timed_out": true }))
    }
}
