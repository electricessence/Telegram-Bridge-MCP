//! notify — styled notification with severity prefix.
//! Mirrors src/tools/notify.ts.

use frankenstein::{AsyncTelegramApi, ParseMode};
use frankenstein::methods::SendMessageParams;
use frankenstein::types::ReplyParameters;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::markdown::{escape_html, escape_v2, markdown_to_v2};
use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result, validate_text};
use crate::topic_state::apply_topic_to_title;
use crate::typing_state::cancel_typing;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NotifyParams {
    /// Short bold heading, e.g. "Build Failed"
    pub title: String,

    /// Optional detail paragraph
    pub body: Option<String>,

    /// Controls the emoji prefix (info/success/warning/error)
    #[serde(default = "default_severity")]
    pub severity: String,

    /// Markdown = standard Markdown auto-converted (default); MarkdownV2 = raw; HTML = HTML tags
    #[serde(default = "default_parse_mode")]
    pub parse_mode: String,

    /// Send silently (no phone notification)
    pub disable_notification: Option<bool>,

    /// Reply to this message ID
    pub reply_to_message_id: Option<i32>,
}

fn default_severity() -> String { "info".to_owned() }
fn default_parse_mode() -> String { "Markdown".to_owned() }

fn severity_prefix(sev: &str) -> &'static str {
    match sev {
        "success" => "✅",
        "warning" => "⚠️",
        "error"   => "❌",
        _         => "ℹ️",
    }
}

pub async fn impl_notify(params: NotifyParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let prefix = severity_prefix(&params.severity);
    let use_v2 = params.parse_mode == "Markdown" || params.parse_mode == "MarkdownV2";
    let topic_title = apply_topic_to_title(&params.title).await;

    let title_formatted = if use_v2 {
        format!("*{}*", escape_v2(&topic_title))
    } else {
        format!("<b>{}</b>", escape_html(&topic_title))
    };

    let mut lines = vec![format!("{prefix} {title_formatted}")];

    if let Some(body) = &params.body {
        let trimmed = body.trim();
        if !trimmed.is_empty() {
            let body_text = if params.parse_mode == "Markdown" {
                markdown_to_v2(trimmed)
            } else {
                trimmed.to_owned()
            };
            lines.push(String::new());
            lines.push(body_text);
        }
    }

    let text = lines.join("\n");
    let final_mode = if params.parse_mode == "Markdown" || params.parse_mode == "MarkdownV2" {
        ParseMode::MarkdownV2
    } else {
        ParseMode::Html
    };

    if let Some(err) = validate_text(&text) {
        return to_error(&err);
    }
    cancel_typing().await;

    let mut send_params = SendMessageParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .text(text)
        .parse_mode(final_mode)
        .build();

    if params.disable_notification == Some(true) {
        send_params.disable_notification = Some(true);
    }
    if let Some(reply_id) = params.reply_to_message_id {
        send_params.reply_parameters = Some(
            ReplyParameters::builder().message_id(reply_id).build(),
        );
    }

    match call_api(|| get_api().send_message(&send_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "message_id": resp.result.message_id })),
        Err(e) => frank_to_tool_result(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severity_prefix_correct() {
        assert_eq!(severity_prefix("info"), "ℹ️");
        assert_eq!(severity_prefix("success"), "✅");
        assert_eq!(severity_prefix("warning"), "⚠️");
        assert_eq!(severity_prefix("error"), "❌");
        assert_eq!(severity_prefix("other"), "ℹ️");
    }

    #[test]
    fn title_formatted_v2() {
        let escaped = format!("*{}*", escape_v2("Hello.World"));
        assert_eq!(escaped, "*Hello\\.World*");
    }
}
