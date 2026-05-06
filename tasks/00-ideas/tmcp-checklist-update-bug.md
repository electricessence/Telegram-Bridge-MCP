# Bug: checklist/update action fails with undefined replace error

action(type: "checklist/update") consistently fails with:
{"code":"UNKNOWN","message":"Cannot read properties of undefined (reading 'replace')"}

Reproduced 3x passing full `steps` array with `message_id`. Checklist creation (via send type:"checklist") works fine. Only checklist/update fails.

Repro: create a checklist via send, then call action(type:"checklist/update", message_id: <id>, steps: [...]).

Expected: steps updated in place. Actual: UNKNOWN error.
