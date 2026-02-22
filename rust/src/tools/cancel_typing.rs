//! cancel_typing — cancels the sustained typing indicator.
//! Mirrors src/tools/cancel_typing.ts.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::to_result;
use crate::typing_state::cancel_typing;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CancelTypingParams {}

pub async fn impl_cancel_typing(_params: CancelTypingParams) -> CallToolResult {
    let was_active = cancel_typing().await;
    to_result(&serde_json::json!({ "cancelled": was_active }))
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn cancel_when_inactive_returns_false() {
        crate::typing_state::reset_typing().await;
        let result = super::impl_cancel_typing(super::CancelTypingParams {}).await;
        let text = &result.content[0];
        if let rmcp::model::RawContent::Text(t) = &text.raw {
            let v: serde_json::Value = serde_json::from_str(&t.text).unwrap();
            assert_eq!(v["cancelled"], false);
        }
    }
}
