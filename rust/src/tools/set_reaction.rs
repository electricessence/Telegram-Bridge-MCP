//! set_reaction — sets an emoji reaction on a message.
//! Mirrors src/tools/set_reaction.ts.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::SetMessageReactionParams;
use frankenstein::types::{ReactionType, ReactionTypeEmoji};
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, make_chat_id, resolve_chat, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetReactionParams {
    /// ID of the message to react to
    pub message_id: i32,

    /// Emoji to react with. Omit or pass empty string to remove reactions.
    pub emoji: Option<String>,

    /// Use big animation (default false)
    pub is_big: Option<bool>,
}

pub async fn impl_set_reaction(params: SetReactionParams) -> CallToolResult {
    let chat_id = match resolve_chat() {
        Ok(id) => id,
        Err(e) => return to_error(&e),
    };

    let reactions = match &params.emoji {
        Some(e) if !e.is_empty() => vec![
            ReactionType::Emoji(ReactionTypeEmoji {
                emoji: e.clone(),
            })
        ],
        _ => vec![], // empty = remove reactions
    };

    let mut reaction_params = SetMessageReactionParams::builder()
        .chat_id(make_chat_id(&chat_id))
        .message_id(params.message_id)
        .reaction(reactions)
        .build();

    if params.is_big == Some(true) {
        reaction_params.is_big = Some(true);
    }

    match call_api(|| get_api().set_message_reaction(&reaction_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "ok": resp.result })),
        Err(e) => frank_to_tool_result(e),
    }
}
