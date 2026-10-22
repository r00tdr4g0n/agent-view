// Self-contained contract: no imports. The pane keeps only the fields it draws,
// projected from $.agent.list()'s AgentInfo, so the stored shape is decoupled.
export type AgentRowStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'idle'
  | 'completed'
  | 'failed'
  | 'killed'

export type AgentRow = {
  id: string
  type: string
  status: AgentRowStatus
  parentId?: string
  name?: string
  teammateId?: string
  description?: string
}

// One snapshot of the roster plus the moment it was taken.
export type AgentSnapshot = {
  agents: AgentRow[]
  refreshedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-view': {
      snapshot: AgentSnapshot
      // The session's title, captured from SessionStart; '' until known.
      sessionName: string
    }
  }
}
