Startup — Post-Session-Start

Token: opaque integer returned by session/start. Required for all session-bound calls. Save it now.
Reconnect: action(type: 'session/reconnect', name: '...') if token is lost.
Missed messages: action(type: 'message/history', count: 20) after reconnect.

Profile (optional): action(type: 'profile/load', key: '<name>') — restores voice, animation presets, and reminders. Skip if no profile exists.

Next step: help(topic: 'quick_start') → dequeue loop, send basics, DM pattern.

Discover: help() → tool index · help(topic: 'guide') → full comms guide · help(topic: '<tool>') → per-tool docs.
Compression: help(topic: 'compression') → message brevity tiers.
