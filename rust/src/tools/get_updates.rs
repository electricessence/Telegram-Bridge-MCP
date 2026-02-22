//! get_updates — polls Telegram for pending updates.
//! Mirrors src/tools/get_updates.ts.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::GetUpdatesParams;
use frankenstein::types::{AllowedUpdate, MaybeInaccessibleMessage};
use frankenstein::updates::{Update, UpdateContent};
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{
    advance_offset, filter_allowed_updates, frank_to_tool_result, get_api, get_offset,
    reset_offset, to_result, DEFAULT_ALLOWED_UPDATES,
};
use crate::transcribe::transcribe_with_indicator;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetUpdatesToolParams {
    /// Max number of updates to return (1–100)
    #[serde(default = "default_limit")]
    pub limit: u32,

    /// Long-poll timeout in seconds. 0 = short poll.
    #[serde(default)]
    pub timeout_seconds: u32,

    /// Filter by update types, e.g. ["message", "callback_query"].
    pub allowed_updates: Option<Vec<String>>,

    /// If true, resets the stored offset to 0 before fetching.
    pub reset_offset: Option<bool>,
}

fn default_limit() -> u32 { 10 }

pub async fn impl_get_updates(params: GetUpdatesToolParams) -> CallToolResult {
    if params.reset_offset == Some(true) {
        reset_offset().await;
    }

    let allowed: Vec<AllowedUpdate> = match params.allowed_updates {
        Some(strs) => strs.iter()
            .filter_map(|s| serde_json::from_str(&format!("\"{s}\"")).ok())
            .collect(),
        None => DEFAULT_ALLOWED_UPDATES.to_vec(),
    };

    let get_params = GetUpdatesParams::builder()
        .offset(get_offset().await)
        .limit(params.limit)
        .timeout(params.timeout_seconds)
        .allowed_updates(allowed)
        .build();

    let updates = match get_api().get_updates(&get_params).await {
        Ok(resp) => resp.result,
        Err(e) => return frank_to_tool_result(e),
    };

    advance_offset(&updates).await;
    let updates = filter_allowed_updates(updates);

    // Sanitize updates into a clean shape for the agent
    let mut sanitized: Vec<serde_json::Value> = Vec::new();
    for u in updates {
        let val = sanitize_update(u).await;
        sanitized.push(val);
    }

    to_result(&sanitized)
}

async fn sanitize_update(u: Update) -> serde_json::Value {
    use serde_json::json;

    match u.content {
        UpdateContent::Message(msg) => {
            let base = json!({
                "message_id": msg.message_id,
                "reply_to_message_id": msg.reply_to_message.as_ref().map(|r| r.message_id),
            });

            if let Some(voice) = msg.voice {
                let text = transcribe_with_indicator(&voice.file_id, msg.message_id).await
                    .unwrap_or_else(|e| format!("[transcription failed: {e}]"));
                return json!({
                    "type": "message",
                    "content_type": "voice",
                    "message_id": base["message_id"],
                    "reply_to_message_id": base["reply_to_message_id"],
                    "text": text,
                    "voice": true,
                });
            }
            if let Some(text) = msg.text {
                return json!({
                    "type": "message",
                    "content_type": "text",
                    "message_id": base["message_id"],
                    "reply_to_message_id": base["reply_to_message_id"],
                    "text": text,
                });
            }
            if let Some(doc) = msg.document {
                return json!({
                    "type": "message",
                    "content_type": "document",
                    "message_id": base["message_id"],
                    "reply_to_message_id": base["reply_to_message_id"],
                    "file_id": doc.file_id,
                    "file_unique_id": doc.file_unique_id,
                    "file_name": doc.file_name,
                    "mime_type": doc.mime_type,
                    "file_size": doc.file_size,
                    "caption": msg.caption,
                });
            }
            if let Some(photos) = msg.photo {
                if let Some(largest) = photos.last() {
                    return json!({
                        "type": "message",
                        "content_type": "photo",
                        "message_id": base["message_id"],
                        "reply_to_message_id": base["reply_to_message_id"],
                        "file_id": largest.file_id,
                        "file_unique_id": largest.file_unique_id,
                        "width": largest.width,
                        "height": largest.height,
                        "file_size": largest.file_size,
                        "caption": msg.caption,
                    });
                }
            }
            if let Some(audio) = msg.audio {
                return json!({
                    "type": "message",
                    "content_type": "audio",
                    "message_id": base["message_id"],
                    "reply_to_message_id": base["reply_to_message_id"],
                    "file_id": audio.file_id,
                    "file_unique_id": audio.file_unique_id,
                    "title": audio.title,
                    "performer": audio.performer,
                    "duration": audio.duration,
                    "mime_type": audio.mime_type,
                    "file_size": audio.file_size,
                    "caption": msg.caption,
                });
            }
            if let Some(video) = msg.video {
                return json!({
                    "type": "message",
                    "content_type": "video",
                    "message_id": base["message_id"],
                    "reply_to_message_id": base["reply_to_message_id"],
                    "file_id": video.file_id,
                    "width": video.width,
                    "height": video.height,
                    "duration": video.duration,
                    "mime_type": video.mime_type,
                    "file_size": video.file_size,
                    "caption": msg.caption,
                });
            }
            // Unknown message type
            json!({
                "type": "message",
                "content_type": "unknown",
                "message_id": base["message_id"],
                "reply_to_message_id": base["reply_to_message_id"],
            })
        }
        UpdateContent::CallbackQuery(cq) => {
            let msg_id = cq.message.as_ref().map(|m| match m {
                MaybeInaccessibleMessage::Message(msg) => msg.message_id,
                MaybeInaccessibleMessage::InaccessibleMessage(im) => im.message_id,
            });
            json!({
                "type": "callback_query",
                "callback_query_id": cq.id,
                "data": cq.data,
                "message_id": msg_id,
            })
        }
        _ => json!({ "type": "unknown", "update_id": u.update_id }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_limit_is_10() {
        assert_eq!(default_limit(), 10);
    }
}
