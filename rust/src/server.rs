//! TelegramBridgeServer — MCP ServerHandler implementation.
//! Registers all 30 tools and dispatches call_tool to per-tool async functions.

use rmcp::{
    ErrorData as McpError,
    ServerHandler,
    handler::server::tool::schema_for_type,
    model::{
        CallToolRequestParams, CallToolResult, Implementation,
        ListToolsResult, PaginatedRequestParams, ServerInfo, Tool,
    },
    service::RequestContext,
    RoleServer,
};

// ── Tool parameter types and impl functions ─────────────────────────────────
use crate::tools::{
    answer_callback_query::{impl_answer_callback_query, AnswerCallbackQueryToolParams},
    ask::{impl_ask, AskParams},
    cancel_typing::{impl_cancel_typing, CancelTypingParams},
    choose::{impl_choose, ChooseParams},
    delete_message::{impl_delete_message, DeleteMessageToolParams},
    download_file::{impl_download_file, DownloadFileParams},
    edit_message_text::{impl_edit_message_text, EditMessageTextToolParams},
    forward_message::{impl_forward_message, ForwardMessageToolParams},
    get_agent_guide::{impl_get_agent_guide, GetAgentGuideParams},
    get_chat::{impl_get_chat, GetChatToolParams},
    get_me::{impl_get_me, GetMeParams},
    get_updates::{impl_get_updates, GetUpdatesToolParams},
    notify::{impl_notify, NotifyParams},
    pin_message::{impl_pin_message, PinMessageParams},
    restart_server::{impl_restart_server, RestartServerParams},
    send_audio::{impl_send_audio, SendAudioToolParams},
    send_chat_action::{impl_send_chat_action, SendChatActionToolParams},
    send_confirmation::{impl_send_confirmation, SendConfirmationParams},
    send_document::{impl_send_document, SendDocumentToolParams},
    send_message::{impl_send_message, SendMessageToolParams},
    send_photo::{impl_send_photo, SendPhotoToolParams},
    send_video::{impl_send_video, SendVideoToolParams},
    send_voice::{impl_send_voice, SendVoiceToolParams},
    set_commands::{impl_set_commands, SetCommandsParams},
    set_reaction::{impl_set_reaction, SetReactionParams},
    set_topic::{impl_set_topic, SetTopicParams},
    show_typing::{impl_show_typing, ShowTypingParams},
    update_status::{impl_update_status, UpdateStatusParams},
    wait_for_callback_query::{impl_wait_for_callback_query, WaitForCallbackQueryParams},
    wait_for_message::{impl_wait_for_message, WaitForMessageParams},
};

// ── Server struct ────────────────────────────────────────────────────────────

pub struct TelegramBridgeServer;

impl TelegramBridgeServer {
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self)
    }

    fn tool<P: rmcp::schemars::JsonSchema + 'static>(name: &'static str, description: &'static str) -> Tool {
        Tool::new(name, description, schema_for_type::<P>())
    }

    fn all_tools() -> Vec<Tool> {
        vec![
            // ── High-level agent tools ────────────────────────────────────
            Self::tool::<GetAgentGuideParams>(
                "get_agent_guide",
                "Returns the agent behavior guide for this MCP server. Call this at the start of a session to understand how to communicate with the user, which tools to use, and all behavioral conventions.",
            ),
            Self::tool::<SetTopicParams>(
                "set_topic",
                "Sets a default title (e.g. \"[Code Review]\") prepended to all subsequent outbound messages. Pass null or empty string to clear. Persists until changed or server restarts.",
            ),
            Self::tool::<NotifyParams>(
                "notify",
                "Sends a formatted notification message to a chat. Handles severity styling (info/success/warning/error) automatically with emoji prefixes and bold titles. The most common agent tool — use for build results, progress updates, and status changes. Default parse_mode is Markdown.",
            ),
            Self::tool::<AskParams>(
                "ask",
                "Sends a question to a chat and blocks until the user replies with a text message. Returns the reply text directly. Use for open-ended prompts where a button isn't appropriate.",
            ),
            Self::tool::<ChooseParams>(
                "choose",
                "Sends a question with 2–8 labeled option buttons and blocks until the user presses one. Returns { label, value } of the chosen option. Handles answering the callback_query automatically.",
            ),
            Self::tool::<UpdateStatusParams>(
                "update_status",
                "Creates or updates a live task checklist message in Telegram. First call (no message_id) sends the message and returns its ID. Subsequent calls edit it in-place with the latest step statuses.",
            ),
            Self::tool::<SendConfirmationParams>(
                "send_confirmation",
                "Sends a message with Yes/No inline keyboard buttons. Returns the message_id to pass to wait_for_callback_query. Designed for agent-to-human approval/confirmation workflows.",
            ),

            // ── Interaction primitives ────────────────────────────────────
            Self::tool::<WaitForCallbackQueryParams>(
                "wait_for_callback_query",
                "Blocks (long-poll) until an inline button is pressed, then returns the callback data. Optionally filter by message_id. Returns { timed_out: true } if nobody responds within timeout_seconds.",
            ),
            Self::tool::<WaitForMessageParams>(
                "wait_for_message",
                "Blocks (long-poll) until any message is received, then returns structured data. Voice messages are auto-transcribed. Optionally filter by sender user_id. Returns { timed_out: true } on expiry.",
            ),
            Self::tool::<AnswerCallbackQueryToolParams>(
                "answer_callback_query",
                "Acknowledges a callback query from an inline button press. Must be called within 30 s of receiving the update. Optionally shows a toast or alert to the user.",
            ),

            // ── Messaging ─────────────────────────────────────────────────
            Self::tool::<SendChatActionToolParams>(
                "send_chat_action",
                "Sends a one-shot chat action indicator (e.g. \"typing…\") that lasts ~5 s. For sustained typing, use show_typing instead.",
            ),
            Self::tool::<ShowTypingParams>(
                "show_typing",
                "Starts (or extends) a sustained background typing indicator that repeats every 4 s until the timeout expires or a real message is sent. Idempotent — safe to call multiple times; only one interval runs at a time.",
            ),
            Self::tool::<CancelTypingParams>(
                "cancel_typing",
                "Immediately stops the typing indicator started by show_typing. No-op if no indicator is running.",
            ),
            Self::tool::<RestartServerParams>(
                "restart_server",
                "Restarts the MCP server process. VS Code detects the exit and relaunches it automatically, picking up any freshly built code.",
            ),
            Self::tool::<SendMessageToolParams>(
                "send_message",
                "Sends a text message to a Telegram chat. Default parse_mode is Markdown — write standard Markdown and it is auto-converted. Messages longer than 4096 characters are automatically split. When TTS is configured, setting voice:true sends the message as a spoken voice note.",
            ),
            Self::tool::<EditMessageTextToolParams>(
                "edit_message_text",
                "Edits the text of a previously sent message. Supports Markdown auto-conversion (default), MarkdownV2, and HTML. Can optionally update or clear the inline keyboard.",
            ),
            Self::tool::<SendPhotoToolParams>(
                "send_photo",
                "Sends a photo to a chat by public URL or Telegram file_id. Supports captions and inline keyboards.",
            ),
            Self::tool::<SendDocumentToolParams>(
                "send_document",
                "Sends a file (document) to the Telegram chat. Accepts a local file path, a public HTTPS URL, or a Telegram file_id. Use this to send PDFs, Excel files, ZIPs, text files, or any other file type.",
            ),
            Self::tool::<SendVideoToolParams>(
                "send_video",
                "Sends a video to the Telegram chat. Accepts a local file path, a public HTTPS URL, or a Telegram file_id. Supports optional caption, duration, and dimensions.",
            ),
            Self::tool::<SendAudioToolParams>(
                "send_audio",
                "Sends an audio file to the Telegram chat. Accepts a local file path, a public HTTPS URL, or a Telegram file_id. Audio files are shown as playable tracks with title and performer metadata.",
            ),
            Self::tool::<SendVoiceToolParams>(
                "send_voice",
                "Sends a voice note to the Telegram chat. The file should be in OGG/OPUS format. Accepts a local file path, a public HTTPS URL, or a Telegram file_id.",
            ),
            Self::tool::<DownloadFileParams>(
                "download_file",
                "Downloads a file from Telegram by file_id and saves it to a local temp directory. Returns the local path, file name, MIME type, and file size. For text-based files under 100 KB, also returns the file contents.",
            ),
            Self::tool::<ForwardMessageToolParams>(
                "forward_message",
                "Forwards a message from a source chat to the bot's configured chat.",
            ),
            Self::tool::<DeleteMessageToolParams>(
                "delete_message",
                "Deletes a message. The bot can delete its own messages anytime, or other users' messages within 48 hours if admin.",
            ),
            Self::tool::<PinMessageParams>(
                "pin_message",
                "Pins a message in a chat. Requires the bot to have appropriate admin rights.",
            ),
            Self::tool::<SetReactionParams>(
                "set_reaction",
                "Sets an emoji reaction on a message. Non-premium bots can set up to 1 reaction per message. Pass an empty string to remove reactions.",
            ),

            // ── Bot / chat info ───────────────────────────────────────────
            Self::tool::<GetUpdatesToolParams>(
                "get_updates",
                "Retrieves pending Telegram updates using the server's internal offset (polling pattern). Call repeatedly to consume the update queue. Advances the offset automatically so previously seen updates are never re-delivered.",
            ),
            Self::tool::<GetMeParams>(
                "get_me",
                "Returns basic information about the bot (id, username, name, capabilities).",
            ),
            Self::tool::<GetChatToolParams>(
                "get_chat",
                "Returns information about the configured chat: id, type, title, username, first/last name, and description.",
            ),
            Self::tool::<SetCommandsParams>(
                "set_commands",
                "Sets (or clears) the slash-command menu shown in Telegram when the user types \"/\". Pass an array of {command, description} pairs to register commands. Pass an empty array to remove all commands.",
            ),
        ]
    }
}

// ── ServerHandler implementation ─────────────────────────────────────────────

impl ServerHandler for TelegramBridgeServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            server_info: Implementation::from_build_env(),
            ..Default::default()
        }
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult {
            tools: Self::all_tools(),
            next_cursor: None,
            meta: None,
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        let args = request.arguments.unwrap_or_default();

        macro_rules! dispatch {
            ($Params:ty, $impl_fn:expr) => {{
                let p: $Params = parse_args(args)?;
                Ok($impl_fn(p).await)
            }};
        }

        match request.name.as_ref() {
            "get_agent_guide" => dispatch!(GetAgentGuideParams, impl_get_agent_guide),
            "set_topic" => dispatch!(SetTopicParams, impl_set_topic),
            "notify" => dispatch!(NotifyParams, impl_notify),
            "ask" => dispatch!(AskParams, impl_ask),
            "choose" => dispatch!(ChooseParams, impl_choose),
            "update_status" => dispatch!(UpdateStatusParams, impl_update_status),
            "send_confirmation" => dispatch!(SendConfirmationParams, impl_send_confirmation),
            "wait_for_callback_query" => dispatch!(WaitForCallbackQueryParams, impl_wait_for_callback_query),
            "wait_for_message" => dispatch!(WaitForMessageParams, impl_wait_for_message),
            "answer_callback_query" => dispatch!(AnswerCallbackQueryToolParams, impl_answer_callback_query),
            "send_chat_action" => dispatch!(SendChatActionToolParams, impl_send_chat_action),
            "show_typing" => dispatch!(ShowTypingParams, impl_show_typing),
            "cancel_typing" => dispatch!(CancelTypingParams, impl_cancel_typing),
            "restart_server" => dispatch!(RestartServerParams, impl_restart_server),
            "send_message" => dispatch!(SendMessageToolParams, impl_send_message),
            "edit_message_text" => dispatch!(EditMessageTextToolParams, impl_edit_message_text),
            "send_photo" => dispatch!(SendPhotoToolParams, impl_send_photo),
            "send_document" => dispatch!(SendDocumentToolParams, impl_send_document),
            "send_video" => dispatch!(SendVideoToolParams, impl_send_video),
            "send_audio" => dispatch!(SendAudioToolParams, impl_send_audio),
            "send_voice" => dispatch!(SendVoiceToolParams, impl_send_voice),
            "download_file" => dispatch!(DownloadFileParams, impl_download_file),
            "forward_message" => dispatch!(ForwardMessageToolParams, impl_forward_message),
            "delete_message" => dispatch!(DeleteMessageToolParams, impl_delete_message),
            "pin_message" => dispatch!(PinMessageParams, impl_pin_message),
            "set_reaction" => dispatch!(SetReactionParams, impl_set_reaction),
            "get_updates" => dispatch!(GetUpdatesToolParams, impl_get_updates),
            "get_me" => dispatch!(GetMeParams, impl_get_me),
            "get_chat" => dispatch!(GetChatToolParams, impl_get_chat),
            "set_commands" => dispatch!(SetCommandsParams, impl_set_commands),
            _ => Err(McpError::invalid_params(
                format!("Unknown tool: {}", request.name),
                None,
            )),
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn parse_args<T: serde::de::DeserializeOwned>(
    args: serde_json::Map<String, serde_json::Value>,
) -> Result<T, McpError> {
    serde_json::from_value(serde_json::Value::Object(args)).map_err(|e| {
        McpError::invalid_params(format!("Failed to deserialize tool parameters: {e}"), None)
    })
}
