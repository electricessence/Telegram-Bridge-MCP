//! set_topic — sets the active loop topic title for the session.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::to_result;
use crate::topic_state;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetTopicParams {
    /// Topic/title to set for the current session loop.
    /// Pass null or empty string to clear the topic.
    pub topic: Option<String>,
}

pub async fn impl_set_topic(params: SetTopicParams) -> CallToolResult {
    let topic = params.topic.filter(|s| !s.is_empty());
    topic_state::set_topic(topic.clone()).await;
    to_result(&serde_json::json!({
        "topic": topic,
        "message": if topic.is_some() { "Topic set" } else { "Topic cleared" }
    }))
}
