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

    // The agent list is a Select (arrow-key navigable); the main-session entry
    // is always present, so the Select renders even with no agents.
    const select = await ui.find({ type: 'Select' })
    expect(select).toBeDefined()

    // The status legend names the glyphs.
    const legend = await ui.find({ type: 'Text', text: /실행.*완료/ })
    expect(legend).toBeDefined()

    await ui.unmount()
  }
})
