//! restart_server — exits the process so the process manager restarts it.
//! Mirrors src/tools/restart_server.ts.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::to_result;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RestartServerParams {}

pub async fn impl_restart_server(_params: RestartServerParams) -> CallToolResult {
    let result = to_result(&serde_json::json!({ "restarting": true }));
    // Schedule exit on next tick so the response is sent first
    tokio::spawn(async {
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
        std::process::exit(0);
    });
    result
}
