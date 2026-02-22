//! get_agent_guide — returns the agent behavioral guide (BEHAVIOR.md contents).

use rmcp::model::{CallToolResult, Content};
use schemars::JsonSchema;
use serde::Deserialize;

const BEHAVIOR_MD: &str = include_str!("../../../BEHAVIOR.md");

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetAgentGuideParams {}

pub async fn impl_get_agent_guide(_params: GetAgentGuideParams) -> CallToolResult {
    CallToolResult::success(vec![Content::text(BEHAVIOR_MD.to_owned())])
}
