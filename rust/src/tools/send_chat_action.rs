//! send_chat_action — sends a one-shot chat action indicator.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::SendChatActionParams;
use frankenstein::types::ChatAction;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SendChatActionToolParams {
    /// Action to broadcast (default: "typing")
    #[serde(default = "default_action")]
    pub action: String,
}

fn default_action() -> String { "typing".to_owned() }

fn parse_action(s: &str) -> ChatAction {
    match s {
        "upload_photo" => ChatAction::UploadPhoto,
        "record_video" => ChatAction::RecordVideo,
        "upload_video" => ChatAction::UploadVideo,
        "record_voice" => ChatAction::RecordVoice,
        "upload_voice" => ChatAction::UploadVoice,
        "upload_document" => ChatAction::UploadDocument,
        "find_location" => ChatAction::FindLocation,
        "record_video_note" => ChatAction::RecordVideoNote,
        "upload_video_note" => ChatAction::UploadVideoNote,
        "choose_sticker" => ChatAction::ChooseSticker,
        _ => ChatAction::Typing,
    }
}

pub async fn impl_send_chat_action(params: SendChatActionToolParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let action_params = SendChatActionParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .action(parse_action(&params.action))
        .build();

    match call_api(|| get_api().send_chat_action(&action_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "ok": resp.result })),
        Err(e) => frank_to_tool_result(e),
    }
}
