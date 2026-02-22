//! send_confirmation — sends a Yes/No inline keyboard, waits for the user to press one.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::SendMessageParams;
use frankenstein::types::{InlineKeyboardButton, InlineKeyboardMarkup, MaybeInaccessibleMessage, ReplyMarkup};
use frankenstein::updates::UpdateContent;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, poll_until, resolve_chat, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SendConfirmationParams {
    /// The question or request requiring confirmation
    pub text: String,

    /// Label for the Yes button
    #[serde(default = "default_yes_text")]
    pub yes_text: String,
    /// Callback data for Yes button
    #[serde(default = "default_yes_data")]
    pub yes_data: String,

    /// Label for the No button
    #[serde(default = "default_no_text")]
    pub no_text: String,
    /// Callback data for No button
    #[serde(default = "default_no_data")]
    pub no_data: String,

    /// Parse mode
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,

    /// Reply to this message ID
    pub reply_to_message_id: Option<i32>,
}

fn default_yes_text() -> String { "✅ Yes".to_owned() }
fn default_yes_data() -> String { "confirm_yes".to_owned() }
fn default_no_text()  -> String { "❌ No".to_owned() }
fn default_no_data()  -> String { "confirm_no".to_owned() }
fn default_parse_mode() -> String { "Markdown".to_owned() }

pub async fn impl_send_confirmation(params: SendConfirmationParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let keyboard = InlineKeyboardMarkup::builder()
        .inline_keyboard(vec![vec![
            InlineKeyboardButton::builder()
                .text(params.yes_text.clone())
                .callback_data(params.yes_data.clone())
                .build(),
            InlineKeyboardButton::builder()
                .text(params.no_text.clone())
                .callback_data(params.no_data.clone())
                .build(),
        ]])
        .build();

    let body = if params.parse_mode == "Markdown" {
        crate::markdown::markdown_to_v2(&params.text)
    } else {
        params.text.clone()
    };
    let mode = if params.parse_mode == "HTML" {
        frankenstein::ParseMode::Html
    } else {
        frankenstein::ParseMode::MarkdownV2
    };

    let mut send_params = SendMessageParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .text(body)
        .parse_mode(mode)
        .reply_markup(ReplyMarkup::InlineKeyboardMarkup(keyboard))
        .build();

    if let Some(reply_id) = params.reply_to_message_id {
        send_params.reply_parameters = Some(
            frankenstein::types::ReplyParameters::builder().message_id(reply_id).build()
        );
    }

    let sent_msg = match call_api(|| get_api().send_message(&send_params)).await {
        Ok(resp) => resp.result,
        Err(e) => return frank_to_tool_result(e),
    };

    let question_msg_id = sent_msg.message_id;
    let yes_data = params.yes_data.clone();
    let no_data = params.no_data.clone();

    let result = poll_until(
        move |updates| {
            for update in updates {
                if let UpdateContent::CallbackQuery(cq) = &update.content {
                    if let Some(ref data) = cq.data {
                        if data == &yes_data || data == &no_data {
                            let cq_msg_id = cq.message.as_ref().map(|m| match m {
                                MaybeInaccessibleMessage::Message(msg) => msg.message_id,
                                MaybeInaccessibleMessage::InaccessibleMessage(im) => im.message_id,
                            });
                            if cq_msg_id == Some(question_msg_id) {
                                return Some(serde_json::json!({
                                    "callback_query_id": cq.id,
                                    "confirmed": data == &yes_data,
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
        60,
    ).await;

    if let Some(matched) = result.matched {
        to_result(&matched)
    } else {
        to_result(&serde_json::json!({ "timed_out": true }))
    }
}
