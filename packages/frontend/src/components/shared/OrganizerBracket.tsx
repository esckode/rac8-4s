import React, { useMemo } from 'react'
import { ReactFlow, Background, Handle, Position, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { BracketRound } from '../../types'
import { playerCache } from '../../state'
import { Badge } from './Badge'
import { bracketToFlow } from './bracketToFlow'
import '../../styles/globals.css'

const nameOf = (id: string | null) => (id ? playerCache.get(id)?.name || 'TBD' : 'TBD')

/** A read-only knockout match, rendered as a React Flow node. */
export const MatchNode: React.FC<NodeProps> = ({ data }) => {
  const { player1, player2, status, score } = data as {
    player1: string
    player2: string
    status: string
    score: string | null
  }
  const completed = status === 'completed'
  return (
    <div
      data-testid="match-card"
      className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-3] w-[--s-56] space-y-[--s-2] shadow-sm"
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="flex items-center justify-between gap-[--s-2]">
        <p className="font-medium text-[--ink-900] truncate">{player1}</p>
        <span className="text-xs text-[--ink-500]">vs</span>
        <p className="font-medium text-[--ink-900] truncate text-right">{player2}</p>
      </div>
      <div className="flex items-center justify-between gap-[--s-2]">
        <Badge variant={completed ? 'complete' : 'live'}>{completed ? 'Completed' : 'Pending'}</Badge>
        {completed && score && <p className="font-bold text-[--ink-900]">{score}</p>}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

/** A round header (Semifinals / Final …), rendered as a React Flow node. */
export const RoundLabelNode: React.FC<NodeProps> = ({ data }) => (
  <div data-testid="bracket-round" className="text-sm font-semibold text-[--ink-700] w-[--s-56] text-center">
    {(data as { label: string }).label}
  </div>
)

const nodeTypes = { matchNode: MatchNode, roundLabel: RoundLabelNode }

/**
 * Organizer view: the full single-elimination bracket as a React Flow tree with
 * drawn connector edges and pan/zoom. Read-only — players submit scores from the
 * match-focused player view. Participant names resolve via the playerCache
 * (seeded from the tournament bundle, incl. doubles team names).
 */
export const OrganizerBracket: React.FC<{ rounds: BracketRound[] }> = ({ rounds }) => {
  const { nodes, edges } = useMemo(() => bracketToFlow(rounds, nameOf), [rounds])

  return (
    <div data-testid="bracket-tree" style={{ height: 480 }} className="rounded-[--r-lg] border border-[--border] bg-[--ink-50]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>
    </div>
  )
}
