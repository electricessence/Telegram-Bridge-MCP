//! set_commands — sets the bot's slash-command menu.
//! Mirrors src/tools/set_commands.ts (via mcp_telegram_set_commands).

use frankenstein::AsyncTelegramApi;
use frankenstein::methods::SetMyCommandsParams;
use frankenstein::types::BotCommand;
use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;

use crate::telegram::{call_api, frank_to_tool_result, get_api, to_result};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CommandEntry {
    /// Command name without leading slash, e.g. "cancel"
    pub command: String,
    /// Short description shown next to the command
    pub description: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetCommandsParams {
    /// Commands to register. Pass [] to clear the command menu.
    pub commands: Vec<CommandEntry>,
}

pub async fn impl_set_commands(params: SetCommandsParams) -> CallToolResult {
    let bot_commands: Vec<BotCommand> = params.commands.iter()
        .map(|c| BotCommand {
            command: c.command.clone(),
            description: c.description.clone(),
        })
        .collect();

    let set_params = SetMyCommandsParams::builder()
        .commands(bot_commands)
        .build();

    match call_api(|| get_api().set_my_commands(&set_params)).await {
        Ok(resp) => to_result(&serde_json::json!({ "ok": resp.result })),
        Err(e) => frank_to_tool_result(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use frankenstein::types::BotCommand;

    #[test]
    fn empty_commands_produces_empty_vec() {
        let params = SetCommandsParams { commands: vec![] };
        let bot_commands: Vec<BotCommand> = params.commands.iter()
            .map(|c| BotCommand { command: c.command.clone(), description: c.description.clone() })
            .collect();
        assert!(bot_commands.is_empty());
    }

    #[test]
    fn command_entry_maps_correctly() {
        let entry = CommandEntry {
            command: "start".to_owned(),
            description: "Start the bot".to_owned(),
        };
        let cmd = BotCommand { command: entry.command.clone(), description: entry.description.clone() };
        assert_eq!(cmd.command, "start");
        assert_eq!(cmd.description, "Start the bot");
    }
}
