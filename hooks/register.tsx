import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, AgentInfo, Timer } from 'claude-code'

import type { AgentRow, AgentRowStatus } from '../types'

const PANE = 'agent-view'
const COMMAND = 'agent-view'
const REFRESH_MS = 2000
// Sentinel value for the main-session row (not an agent id).
const MAIN_VALUE = '__main__'

// One atom holds the whole snapshot, so a refresh redraws the pane in one write.
// The value type is taken from the PluginState contract keyed by this ref.
const snapshot = atom({ plugin: 'agent-view', key: 'snapshot' } as const, {
  agents: [],
  refreshedAt: 0,
})

// The session's title, captured from SessionStart; '' until known, then the
// pane falls back to the working-directory name.
const sessionName = atom({ plugin: 'agent-view', key: 'sessionName' } as const, '')

// How each status reads in the pane: a glyph and a theme color.
const STATUS_META: Record<AgentRowStatus, { glyph: string; color: string; dim: boolean }> = {
  running: { glyph: '●', color: 'success', dim: false }, //  filled circle
  pending: { glyph: '◐', color: 'warning', dim: false }, //  half circle
  waiting: { glyph: '◐', color: 'warning', dim: false },
  idle: { glyph: '○', color: 'suggestion', dim: false }, //  hollow circle
  completed: { glyph: '✓', color: 'cyan', dim: false }, //  check
  failed: { glyph: '✗', color: 'error', dim: false }, //  cross
  killed: { glyph: '✗', color: 'error', dim: true },
}

// The timer is module state (reset on reload), so cancel any prior one before
// starting a new one when session.start fires again.
let ticker: Timer | null = null

// Keep only the fields the pane draws; this is what the contract declares.
function toRow(a: AgentInfo): AgentRow {
  return {
    id: a.id,
    type: a.type,
    status: a.status as AgentRowStatus,
    parentId: a.parentId,
    name: a.name,
    teammateId: a.teammateId,
    description: a.description,
  }
}

// How many agents to remember before dropping the oldest.
const ROSTER_CAP = 300

// Never throws: a failed list leaves the last snapshot standing.
//
// The engine drops a finished agent from $.agent.list() seconds after it ends,
// so a plain replace would make completed subagents vanish from the pane. Merge
// instead: remembered agents are kept with their last-known status, and live
// ones upsert in place, so the roster only grows (up to ROSTER_CAP) within a
// session and finished agents stay visible.
// A one-line summary for the status line under the prompt: a glyph and a count
// per status group, so the roster is visible without opening the pane.
function statusLineText(rows: readonly AgentRow[]): string {
  const n = (f: (a: AgentRow) => boolean) => rows.filter(f).length
  const run = n(a => a.status === 'running')
  const wait = n(a => a.status === 'pending' || a.status === 'waiting')
  const idle = n(a => a.status === 'idle')
  const done = n(a => a.status === 'completed')
  const gone = n(a => a.status === 'failed' || a.status === 'killed')
  return `agents  ${STATUS_META.running.glyph}${run}  ${STATUS_META.pending.glyph}${wait}  ${STATUS_META.idle.glyph}${idle}  ${STATUS_META.completed.glyph}${done}  ${STATUS_META.failed.glyph}${gone}`
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const live = await $.agent.list()
    const refreshedAt = await $.clock.now()
    // Compute the merged roster up front so the same value feeds the snapshot and
    // the status line. Single-writer refresh, so read-then-write is safe here.
    const prev = await read($, snapshot)
    const byId = new Map(prev.agents.map(a => [a.id, a]))
    for (const a of live) byId.set(a.id, toRow(a)) // upsert: update status, add new
    // A Map keeps insertion order, so remembered agents hold their place and
    // live-only ones are appended; keep the most recent ROSTER_CAP.
    const merged = [...byId.values()].slice(-ROSTER_CAP)
    await update($, snapshot, () => ({ agents: merged, refreshedAt }))
    // Pin the summary under the prompt (shows even when the pane is closed).
    $.ui.status(statusLineText(merged))
  } catch {
    // keep the previous snapshot rather than blanking the pane
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Open the live pane of this session’s subagents and forks',
    })

    if (ticker) {
      ticker.cancel()
      ticker = null
    }
    await refresh($)
    void $.ui.open({ id: PANE, title: 'Agents' })
    // $.clock.every's callback takes no args; it uses the captured $ from here.
    ticker = $.clock.every(REFRESH_MS, () => {
      void refresh($)
    })

    return next(e)
  })

  // Capture the session's title. SessionStart carries it at startup/resume/fork;
  // UserPromptSubmit carries the current title on every prompt, so a mid-session
  // /rename is picked up on the next prompt. Both feed the same stored name.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.session_title) await update($, sessionName, () => e.session_title ?? '')
    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.session_title) await update($, sessionName, () => e.session_title ?? '')
    return next(e)
  }).catch(($, e, next) => next(e))

  // Reopen on demand and refresh immediately.
  on('command.run', { command: COMMAND }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Agents pane opened.' }
  }).catch(() => ({ text: 'agent-view: could not open the pane.' }))

  // A spawn changes the roster: refresh right after it settles. If anything here
  // throws, replay what next settled to so the spawn is never blocked by the view.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  }).catch(($, e, next) => next(e))

  // A finished turn may flip an agent to completed/failed: refresh then.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const agents = snap.agents
    // The caret marks the row currently OPEN in the main view, not the focus ring:
    // e.props.view.agentId is the agent whose transcript is on screen (absent = the
    // main conversation). It stays put while the ring moves, and shifts only when a
    // different row is actually opened. '' stands for the main-session row.
    const viewedKey = e.props?.view?.agentId ?? MAIN_VALUE

    // Root label: the captured session title, else the working-directory name,
    // else a neutral fallback. Never let a missing cwd blank the pane.
    let rootLabel = await read($, sessionName)
    if (!rootLabel) {
      try {
        const cwd = await $.session.cwd()
        rootLabel = cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'this session'
      } catch {
        rootLabel = 'this session'
      }
    }

    // Counts per status group for the icon summary (all five states).
    const runCount = agents.filter(a => a.status === 'running').length
    const waitCount = agents.filter(a => a.status === 'pending' || a.status === 'waiting').length
    const idleCount = agents.filter(a => a.status === 'idle').length
    const doneCount = agents.filter(a => a.status === 'completed').length
    const goneCount = agents.filter(a => a.status === 'failed' || a.status === 'killed').length

    // Parent/child order: top-level agents first, each followed by its children.
    const byParent = new Map<string, AgentRow[]>()
    const ids = new Set(agents.map(a => a.id))
    const roots: AgentRow[] = []
    for (const a of agents) {
      if (a.parentId && ids.has(a.parentId)) {
        const kids = byParent.get(a.parentId) ?? []
        kids.push(a)
        byParent.set(a.parentId, kids)
      } else {
        roots.push(a)
      }
    }
    // Walk into a flat list carrying each node's tree prefix. ancestorIsLast[i]
    // tells, for each ancestor, whether it was the last child at its level, so a
    // deeper branch draws a trailing space where the ancestor's line ended and a
    // vertical bar where it continues.
    const BRANCH = '├─ ' //  "|- "
    const LAST = '└─ ' //   "`- "
    const VERT = '│  ' //        "|  "
    const GAP = '   '
    const ordered: { agent: AgentRow; prefix: string }[] = []
    const walk = (a: AgentRow, ancestorIsLast: boolean[]) => {
      const depth = ancestorIsLast.length
      let prefix = ''
      if (depth > 0) {
        for (let i = 0; i < depth - 1; i++) prefix += ancestorIsLast[i] ? GAP : VERT
        prefix += ancestorIsLast[depth - 1] ? LAST : BRANCH
      }
      ordered.push({ agent: a, prefix })
      const kids = byParent.get(a.id) ?? []
      kids.forEach((kid, i) => walk(kid, [...ancestorIsLast, i === kids.length - 1]))
    }
    // This session is the tree's root: every agent the main loop spawned has no
    // parentId, so hang those top-level agents under a synthetic session node.
    // That way the connectors always show, even with a flat list of siblings.
    roots.forEach((r, i) => walk(r, [i === roots.length - 1]))

    // Fill the pane body so the status bar can pin to its bottom edge. The body
    // window is scroll.bodyRows (the rows the surface gave the pane); fall back to
    // the viewport. The status bar is 3 rows (rule + updated + legend); the header
    // and session root are 2 more; the rest is room for agent rows.
    const bodyRows = e.props?.scroll?.bodyRows ?? e.viewport?.rows ?? 24
    // Status bar is 2 rows (rule + legend); session root + count line are 2 more.
    const room = Math.max(1, bodyRows - 4)
    // Rule spans the full pane body width (bodyColumns), adjusting as it resizes.
    const ruleWidth = Math.max(10, e.props?.bodyColumns ?? e.viewport?.columns ?? 28)
    // Leave one row for the main-session entry at the top of the list.
    const shown = ordered.slice(0, Math.max(1, room - 1))
    const hidden = ordered.length - shown.length

    const label = (a: AgentRow) => {
      const head = a.name ?? a.teammateId ?? a.type
      const tail = a.description ? ` — ${a.description}` : ''
      return `${head}${tail}`
    }

    // Each row is a Button, so the whole list stays visible (no collapsing) and
    // a press opens that agent's transcript; the main-session row returns to the
    // main conversation. $.ui.view is allowed because a press is the person's input.
    const openSelected = (value: string): void => {
      void (value === MAIN_VALUE ? $.ui.view({}) : $.ui.view({ agentId: value }))
    }

    return (
      <Box flexDirection="column" height={bodyRows}>
        {/* The agent tree grows from the top, filling the space above the bar. */}
        <Box flexDirection="column" flexGrow={1}>
          {/* Main-session row: always first, returns to the main conversation.
              autoFocus seats the ring here when the pane takes the keyboard, so
              a selected item is always visible from the first focus. */}
          <Button key={MAIN_VALUE} plain autoFocus onPress={() => openSelected(MAIN_VALUE)}>
            <Text bold color="claude">
              {viewedKey === MAIN_VALUE ? '▸ ' : '  '}
              {'◆'} {rootLabel}
            </Text>
          </Button>
          {/* One always-visible Button per agent; the glyph alone carries color. */}
          {shown.map(({ agent, prefix }) => {
            const meta = STATUS_META[agent.status]
            const isSelected = viewedKey === agent.id
            return (
              <Button key={agent.id} plain onPress={() => openSelected(agent.id)}>
                <Text bold color="claude">{isSelected ? '▸ ' : '  '}</Text>
                <Text dimColor>{prefix}</Text>
                <Text color={meta.color} dimColor={meta.dim}>
                  {meta.glyph}
                </Text>{' '}
                <Text bold={isSelected}>{label(agent)}</Text>
              </Button>
            )
          })}
          {hidden > 0 && <Text dimColor>{`… +${hidden} more`}</Text>}
          {/* Icon counts, one per status group, placed below the tree. */}
          <Text>
            <Text color={STATUS_META.running.color}>
              {STATUS_META.running.glyph} {runCount}
            </Text>
            {'  '}
            <Text color={STATUS_META.pending.color}>
              {STATUS_META.pending.glyph} {waitCount}
            </Text>
            {'  '}
            <Text color={STATUS_META.idle.color}>
              {STATUS_META.idle.glyph} {idleCount}
            </Text>
            {'  '}
            <Text color={STATUS_META.completed.color}>
              {STATUS_META.completed.glyph} {doneCount}
            </Text>
            {'  '}
            <Text color={STATUS_META.failed.color}>
              {STATUS_META.failed.glyph} {goneCount}
            </Text>
            {'  '}
            <Text dimColor>{'·'} total {agents.length}</Text>
          </Text>
        </Box>
        {/* Status bar pinned to the bottom edge of the pane. */}
        <Box flexDirection="column">
          <Text dimColor>{'─'.repeat(ruleWidth)}</Text>
          <Text dimColor>{'● 실행  ◐ 대기  ○ 유휴  ✓ 완료  ✗ 종료'}</Text>
        </Box>
      </Box>
    )
  })
}
