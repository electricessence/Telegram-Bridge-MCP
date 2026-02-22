use anyhow::Result;
use rmcp::{ServiceExt, transport::stdio};
use tracing_subscriber::{self, EnvFilter};

use telegram_bridge_mcp::server::TelegramBridgeServer;

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env file if present (mirrors `import "dotenv/config"` in TS)
    let _ = dotenvy::dotenv();

    // Log to stderr — stdout must be clean for MCP JSON-RPC
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    tracing::info!("Starting telegram-bridge-mcp (Rust)");

    let server = TelegramBridgeServer::new()?;
    let service = server
        .serve(stdio())
        .await
        .inspect_err(|e| tracing::error!("MCP serve error: {:?}", e))?;

    service.waiting().await?;
    Ok(())
}
