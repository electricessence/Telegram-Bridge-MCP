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
    let previous = topic_state::get_topic().await;

    // Treat None and whitespace-only as "clear"
    let trimmed = params.topic.as_deref().map(str::trim).filter(|s| !s.is_empty());

    if let Some(t) = trimmed {
        topic_state::set_topic(Some(t.to_owned())).await;
        let new_topic = topic_state::get_topic().await;
        to_result(&serde_json::json!({
            "topic": new_topic,
            "previous": previous,
            "set": true
        }))
    } else {
        topic_state::set_topic(None).await;
        to_result(&serde_json::json!({
            "topic": serde_json::Value::Null,
            "previous": previous,
            "cleared": true
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::OnceLock;

    // Serialise all set_topic tests — they mutate global TOPIC state.
    static TEST_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    fn test_lock() -> &'static tokio::sync::Mutex<()> {
        TEST_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
    }

    async fn reset() {
        topic_state::set_topic(None).await;
    }

    #[tokio::test]
    async fn set_topic_returns_set_true_and_previous() {
        let _guard = test_lock().lock().await;
        reset().await;
        let result = impl_set_topic(SetTopicParams { topic: Some("Refactor Agent".to_owned()) }).await;
        let text = if let rmcp::model::RawContent::Text(t) = &result.content[0].raw { t.text.clone() } else { panic!("not text") };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["set"], true);
        assert_eq!(v["topic"], "Refactor Agent");
        assert_eq!(v["previous"], serde_json::Value::Null);
    }

    #[tokio::test]
    async fn set_topic_captures_previous() {
        let _guard = test_lock().lock().await;
        reset().await;
        topic_state::set_topic(Some("Old Topic".to_owned())).await;
        let result = impl_set_topic(SetTopicParams { topic: Some("New Topic".to_owned()) }).await;
        let text = if let rmcp::model::RawContent::Text(t) = &result.content[0].raw { t.text.clone() } else { panic!("not text") };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["previous"], "Old Topic");
        assert_eq!(v["topic"], "New Topic");
    }

    #[tokio::test]
    async fn clear_topic_with_empty_string() {
        let _guard = test_lock().lock().await;
        reset().await;
        topic_state::set_topic(Some("Existing".to_owned())).await;
        let result = impl_set_topic(SetTopicParams { topic: Some(String::new()) }).await;
        let text = if let rmcp::model::RawContent::Text(t) = &result.content[0].raw { t.text.clone() } else { panic!("not text") };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["cleared"], true);
        assert_eq!(v["topic"], serde_json::Value::Null);
        assert_eq!(v["previous"], "Existing");
    }

    #[tokio::test]
    async fn clear_topic_with_whitespace() {
        let _guard = test_lock().lock().await;
        reset().await;
        topic_state::set_topic(Some("Test Runner".to_owned())).await;
        let result = impl_set_topic(SetTopicParams { topic: Some("   ".to_owned()) }).await;
        let text = if let rmcp::model::RawContent::Text(t) = &result.content[0].raw { t.text.clone() } else { panic!("not text") };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["cleared"], true);
        assert_eq!(v["previous"], "Test Runner");
    }

    #[tokio::test]
    async fn clear_topic_with_none() {
        let _guard = test_lock().lock().await;
        reset().await;
        let result = impl_set_topic(SetTopicParams { topic: None }).await;
        let text = if let rmcp::model::RawContent::Text(t) = &result.content[0].raw { t.text.clone() } else { panic!("not text") };
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["cleared"], true);
    }
}
