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

// The focus ring is captured from ui.focus into the focusedKey atom; the render
// marks that row with an accent caret (▸). Drive the real path: focus the
// main-session row through $.ui.focus, which raises ui.focus, which the hook
// stores; the pane then redraws with the caret on that row.
test('focused row shows the selection caret', async ($, on) => {
  mock.clock(on)

  on('classic.SessionStart', () => ({}))
  // Stand in for the engine beneath the plugin's ui.focus hook: it moves the
  // ring and resolves empty, so $.ui.focus settles and the plugin hook's
  // next(e) has a bottom.
  on('ui.focus', () => ({}))
  await $.classic.SessionStart({ source: 'startup', session_title: 'Test Session' })

  // isFocused true so the site holds the keyboard $.ui.focus requires.
  const ui = await $.ui.mount({
    plugin: 'agent-view',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-view',
    props: { ...PANE, isFocused: true },
  })

  // Seat the ring on the main-session row, as a click or ctrl+x tab would.
  // The real engine raises ui.focus carrying the element's key in `element`;
  // the test kit passes the args through, so set `element` too (production
  // ignores the extra `key`). The hook reads `element`, as UiFocusInput declares.
  await $.ui.focus({ requestId: 'agent-view', key: '__main__', element: '__main__' } as never)
  // Redraw so the instance reflects the focusedKey the hook just stored.
  await ui.redraw()

  // The main row now carries the accent caret while it holds the ring.
  const caret = await ui.find({ type: 'Text', text: /▸/ })
  expect(caret).toBeDefined()

  await ui.unmount()
})
