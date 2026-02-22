//! download_file — downloads a file from Telegram by file_id to a local temp directory.

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::GetFileParams;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;
use std::path::PathBuf;

use crate::telegram::{call_api, frank_to_tool_result, get_api, to_error, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DownloadFileParams {
    /// The Telegram file_id to download
    pub file_id: String,

    /// Suggested file name (used for folder naming and text detection)
    pub file_name: Option<String>,

    /// MIME type hint (used to determine if text contents should be returned)
    pub mime_type: Option<String>,
}

pub async fn impl_download_file(params: DownloadFileParams) -> CallToolResult {
    // Step 1: Get file path from Telegram
    let get_file_params = GetFileParams::builder()
        .file_id(params.file_id.clone())
        .build();

    let file_info = match call_api(|| get_api().get_file(&get_file_params)).await {
        Ok(resp) => resp.result,
        Err(e) => return frank_to_tool_result(e),
    };

    let file_path = match file_info.file_path {
        Some(p) => p,
        None => return to_error(&crate::telegram::TelegramError::new(
            "UNKNOWN", "Telegram returned no file_path".to_owned())),
    };

    let file_size = file_info.file_size;

    // Step 2: Build download URL
    let token = std::env::var("BOT_TOKEN").unwrap_or_default();
    let download_url = format!("https://api.telegram.org/file/bot{token}/{file_path}");

    // Step 3: Determine local save path
    let file_id_short = &params.file_id[..params.file_id.len().min(16)];
    let suggested_name = params.file_name.clone().unwrap_or_else(|| {
        std::path::Path::new(&file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("downloaded_file")
            .to_owned()
    });

    let temp_dir = std::env::temp_dir()
        .join("telegram-mcp")
        .join(file_id_short);

    if let Err(e) = std::fs::create_dir_all(&temp_dir) {
        return to_error(&crate::telegram::TelegramError::new(
            "UNKNOWN", format!("Failed to create temp dir: {e}")));
    }

    let local_path: PathBuf = temp_dir.join(&suggested_name);

    // Step 4: Download
    let client = reqwest::Client::new();
    let bytes = match client.get(&download_url).send().await.and_then(|r| {
        // We need async here — use a blocking approach via bytes()
        futures::executor::block_on(r.bytes()).map_err(|e: reqwest::Error| e)
    }) {
        Ok(b) => b,
        Err(e) => return to_error(&crate::telegram::TelegramError::new("UNKNOWN", e.to_string())),
    };

    if let Err(e) = std::fs::write(&local_path, &bytes) {
        return to_error(&crate::telegram::TelegramError::new(
            "UNKNOWN", format!("Failed to write file: {e}")));
    }

    // Step 5: Optionally read text content
    let mut text_content: Option<String> = None;
    let is_text_mime = params.mime_type.as_deref()
        .map(|m| m.starts_with("text/"))
        .unwrap_or(false);

    if is_text_mime && bytes.len() < 100_000 {
        text_content = String::from_utf8(bytes.to_vec()).ok();
    }

    let final_mime = params.mime_type
        .or_else(|| guess_mime(local_path.to_str().unwrap_or("")))
        .unwrap_or_else(|| "application/octet-stream".to_owned());

    let mut result = serde_json::json!({
        "local_path": local_path.to_str().unwrap_or(""),
        "file_name": suggested_name,
        "mime_type": final_mime,
        "file_size": file_size,
    });

    if let Some(text) = text_content {
        result["text"] = serde_json::Value::String(text);
    }

    to_result(&result)
}

fn guess_mime(path: &str) -> Option<String> {
    let ext = std::path::Path::new(path).extension()?.to_str()?;
    let guess = match ext {
        "txt" => "text/plain",
        "csv" => "text/csv",
        "md" => "text/markdown",
        "html" => "text/html",
        "json" => "application/json",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "ogg" => "audio/ogg",
        "mp3" => "audio/mpeg",
        "zip" => "application/zip",
        _ => return None,
    };
    Some(guess.to_owned())
}
