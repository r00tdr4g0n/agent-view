# agent-view

A Claude Code mod that opens a live pane listing the current session's
subagents, forks, and teammates as a status tree. The engine drops finished
agents from its own list seconds after they end; this pane remembers every
agent it has seen during the session, so completed and failed ones stay
visible instead of vanishing. The tree refreshes every two seconds and the
moment an agent is spawned or a turn completes.

## What it shows

- The session as the tree root (`◆ <session title>`), with every agent hung
  beneath it by its parent so sub-spawned agents nest under their parent.
- One line per agent: a status glyph (colored), then the agent's name and its
  task description. The tree connectors (`├─ └─ │`) and the names stay the
  default text color; only the glyph carries the status color.
- A per-status count line and a status legend pinned to the bottom of the pane.

Status glyphs: `●` running · `◐` pending/waiting · `○` idle · `✓` completed ·
`✗` failed/killed.

## Install

```
/plugin install agent-view --marketplace r00tdr4g0n/agent-view
```

Press `y` to add the marketplace, then choose the **user** scope so it loads in
every session. Open the pane any time with:

```
/agent-view
```

## Notes and limits

- The pane shows agents of the current session only. Fully independent peer
  sessions are not enumerable through the mod API, so they are not listed.
- Accumulation only remembers agents seen while the mod was running; agents
  that finished before the mod loaded cannot be recovered.
- The session title is captured from `SessionStart`; a mid-session rename is
  not seen, so the pane then falls back to the working-directory name.

## Development

The hooks module is `hooks/register.tsx`. Validate, type-check, and test with:

```
claude plugin validate .
claude plugin test .
```
