//! show_typing — starts/extends the sustained typing indicator.
//! Mirrors src/tools/show_typing.ts.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{resolve_chat, to_error, to_result};
use crate::typing_state::show_typing;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ShowTypingParams {
    /// How long to keep the typing indicator alive in seconds (1–300, default 20)
    #[serde(default = "default_timeout")]
    pub timeout_seconds: u64,
}

fn default_timeout() -> u64 { 20 }

pub async fn impl_show_typing(params: ShowTypingParams) -> CallToolResult {
    if let Err(e) = resolve_chat() {
        return to_error(&e);
    }

    let newly_started = show_typing(params.timeout_seconds).await;
    to_result(&serde_json::json!({
        "started": newly_started,
        "extended": !newly_started,
    }))
}

#[cfg(test)]
mod tests {
    #[test]
    fn default_timeout_is_20() {
        assert_eq!(super::default_timeout(), 20);
    }
}
