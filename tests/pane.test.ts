import { test, expect, mock } from 'claude-code/testing'

// Minimal Pane props the render hook is handed as e.props. The hook reads none
// of these (it sizes off e.viewport, omitted here so it falls back), but mount
// requires a well-formed envelope.
const PANE = {
  title: 'Agents',
  isFocused: false,
  bodyColumns: 40,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
}

// With no agents spawned, the pane draws its header and the empty state, on
// every surface that takes a render. One body, run over two surfaces, shows the
// tree does not depend on one of them.
test('pane draws header and empty state on each surface', async ($, on) => {
  // The render hook reads $.clock.now(); give it an in-memory clock.
  mock.clock(on)

  // Stand in for the engine beneath the plugin's classic.SessionStart hook.
  on('classic.SessionStart', () => ({}))
  // SessionStart carries the title; the capture hook stores it and the root
  // label shows it (so render never falls back to $.session.cwd()).
  await $.classic.SessionStart({ source: 'startup', session_title: 'Test Session' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'agent-view',
      surface,
      component: 'Pane',
      requestId: 'agent-view',
      props: PANE,
    })

    const header = await ui.find({ type: 'Text', text: /total/ })
    expect(header).toBeDefined()

    // The main-session row is always present as a pressable Button.
    const mainRow = await ui.find({ type: 'Button' })
    expect(mainRow).toBeDefined()

    // The status legend names the glyphs.
    const legend = await ui.find({ type: 'Text', text: /실행.*완료/ })
    expect(legend).toBeDefined()

    await ui.unmount()
  }
})

// The caret marks the row currently OPEN in the main view (e.props.view.agentId),
// not the focus ring, so it stays put while the ring moves and shifts only when a
// different row is opened. With no agents, only the main row exists: it carries
// the caret while the main conversation is viewed, and loses it when the view
// points at some other agent.
test('caret marks the viewed row, not the focus ring', async ($, on) => {
  mock.clock(on)
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'startup', session_title: 'Test Session' })

  // Viewing the main conversation (no agentId): the main-session row is marked.
  const main = await $.ui.mount({
    plugin: 'agent-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-view',
    props: { ...PANE, view: {} },
  })
  expect(await main.find({ type: 'Text', text: /▸/ })).toBeDefined()
  await main.unmount()

  // Viewing some other agent's transcript: the main row no longer carries it
  // (and that agent is not in the empty list, so nothing is marked).
  const other = await $.ui.mount({
    plugin: 'agent-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-view',
    props: { ...PANE, view: { agentId: 'some-other-agent' } },
  })
  expect(await other.find({ type: 'Text', text: /▸/ })).toBeUndefined()
  await other.unmount()
})
