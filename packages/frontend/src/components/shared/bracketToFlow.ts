import type { Node, Edge } from '@xyflow/react'
import type { BracketRound } from '../../types'

const COL_W = 260
const ROW_H = 110
const HEADER_Y = -64

/**
 * Label a round by its distance from the final, so a 4-participant bracket reads
 * "Semifinals → Final" and an 8-participant one "Quarterfinals → Semifinals → Final".
 */
function roundLabel(roundsCount: number, indexFromStart: number): string {
  const fromEnd = roundsCount - 1 - indexFromStart
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round ${indexFromStart + 1}`
}

/**
 * Transform a single-elimination bracket (rounds of matches) into React Flow
 * nodes + edges: one read-only match node per match, a round-label node per
 * round, and an edge from each match to the next-round match it feeds. Later
 * rounds are vertically centred between their two feeder matches.
 */
export function bracketToFlow(
  rounds: BracketRound[],
  nameOf: (id: string | null) => string
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const idAt = new Map<string, string>() // `${round}-${position}` -> match id

  rounds.forEach((round, i) => {
    const spacing = ROW_H * Math.pow(2, i)
    const yOffset = (spacing - ROW_H) / 2

    nodes.push({
      id: `round-${round.round}`,
      type: 'roundLabel',
      position: { x: i * COL_W, y: HEADER_Y },
      data: { label: roundLabel(rounds.length, i) },
      draggable: false,
      selectable: false,
    })

    round.matches.forEach((m, j) => {
      idAt.set(`${m.round}-${m.position}`, m.id)
      nodes.push({
        id: m.id,
        type: 'matchNode',
        position: { x: i * COL_W, y: j * spacing + yOffset },
        data: {
          player1: nameOf(m.player1Id),
          player2: nameOf(m.player2Id),
          status: m.status,
          score: m.score ?? null,
        },
        draggable: false,
      })
    })
  })

  rounds.forEach((round, i) => {
    if (i === rounds.length - 1) return
    round.matches.forEach((m) => {
      const targetId = idAt.get(`${m.round + 1}-${Math.floor(m.position / 2)}`)
      if (targetId) {
        edges.push({ id: `${m.id}->${targetId}`, source: m.id, target: targetId })
      }
    })
  })

  return { nodes, edges }
}
