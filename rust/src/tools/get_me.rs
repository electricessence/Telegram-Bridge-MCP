//! get_me — returns basic bot info.

use frankenstein::AsyncTelegramApi;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{frank_to_tool_result, get_api, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetMeParams {}

pub async fn impl_get_me(_params: GetMeParams) -> CallToolResult {
    match get_api().get_me().await {
        Ok(resp) => to_result(&resp.result),
        Err(e) => frank_to_tool_result(e),
    }
}

#[cfg(test)]
mod tests {
    // Integration tests require a live BOT_TOKEN — skip in CI.
    // Unit tests for get_me are trivial since it's a direct passthrough.
}
