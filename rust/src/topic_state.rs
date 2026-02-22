//! Topic/title prefix state — mirrors src/topic-state.ts.

use std::sync::OnceLock;
use tokio::sync::Mutex;

static TOPIC: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn topic_mutex() -> &'static Mutex<Option<String>> {
    TOPIC.get_or_init(|| Mutex::new(None))
}

pub async fn get_topic() -> Option<String> {
    topic_mutex().lock().await.clone()
}

pub async fn set_topic(topic: Option<String>) {
    *topic_mutex().lock().await = topic;
}

/// Prepends `[topic] ` to a title if a topic is set.
pub async fn apply_topic_to_title(title: &str) -> String {
    match get_topic().await {
        Some(t) => format!("[{t}] {title}"),
        None => title.to_owned(),
    }
}

/// Prepends `[topic]\n` to message text if a topic is set.
pub async fn apply_topic_to_text(text: &str) -> String {
    match get_topic().await {
        Some(t) => format!("[{t}]\n{text}"),
        None => text.to_owned(),
    }
}
