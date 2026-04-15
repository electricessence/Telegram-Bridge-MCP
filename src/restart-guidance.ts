/** Shared restart guidance appended to both shutdown and pre-warning messages. */
export const RESTART_GUIDANCE =
  "Wait ~30s for restart, then probe: action(type: \"session/list\") — no token needed. " +
  "If your SID is in the list, try your saved token: action(type: \"session/reconnect\", token: <saved>, name: \"...\"). " +
  "Token accepted → resume. SID missing → bridge restarted fresh → session/start.";
