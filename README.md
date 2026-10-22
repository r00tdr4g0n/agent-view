# agent-view

A Claude Code mod that opens a live pane listing the current session's
subagents, forks, and teammates as a status tree. The engine drops finished
agents from its own list seconds after they end; this pane remembers every
agent it has seen during the session, so completed and failed ones stay
visible instead of vanishing. The tree refreshes every two seconds and the
moment an agent is spawned or a turn completes.

## What it shows

- The session itself as the tree root (`◆ <session title>`), with every agent
  hung beneath it by its parent, so sub-spawned agents nest under their parent.
- One row per agent: the tree connector (`├─ └─ │`), a status glyph, the agent's
  name, and its task description. Only the glyph carries the status color; the
  connectors and names stay the default text color.
- A caret (`▸`) marks the row whose transcript is currently open in the main
  view. It stays put while you move the keyboard focus and shifts only when you
  actually open a different row.
- A per-status count line below the tree, and a status legend pinned to the
  bottom edge of the pane.

Status glyphs: `●` running · `◐` pending/waiting · `○` idle · `✓` completed ·
`✗` failed/killed.

## Opening an agent's transcript

Each row is pressable. Selecting one puts that agent's transcript in the main
view (the same switch the tasks list makes); selecting the root row returns to
the main conversation.

- Click a row, or
- Give the pane the keyboard with `Ctrl+X` then `Tab`, move between rows with
  `Tab`, press `Enter` to open the selected row, and `Esc` to return focus to
  the prompt.

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
- The session title is captured from `SessionStart` and refreshed from every
  `UserPromptSubmit`, so a mid-session rename shows on the next prompt. Until a
  title is known, the root falls back to the working-directory name.

## Development

The hooks module is `hooks/register.tsx`. Validate, type-check, and test with:

```
claude plugin validate .
claude plugin test .
```
