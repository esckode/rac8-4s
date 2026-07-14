/**
 * Avatar — Player Personalization P3 (identity colors/avatars).
 *
 * Deterministic per-player color (hash of player id over a curated,
 * color-blind-safe subset of the existing design-token hue families) +
 * 1-2 initials. Zero configuration; makes chat/standings scannable for
 * "where am I / where's Bob". No photo uploads (storage/moderation/DSR
 * surface explicitly out of scope).
 */
import React from 'react'

const PALETTE = ['court', 'gold', 'lavender', 'mint', 'peach', 'pink'] as const
type Hue = (typeof PALETTE)[number]

// Literal class strings (not template-interpolated) so Tailwind's static
// scanner generates them — see DESIGN_SYSTEM_ENFORCEMENT's color lint gate.
const BG_CLASS: Record<Hue, string> = {
  court: 'bg-[--court-500]',
  gold: 'bg-[--gold-500]',
  lavender: 'bg-[--lavender-500]',
  mint: 'bg-[--mint-500]',
  peach: 'bg-[--peach-500]',
  pink: 'bg-[--pink-500]',
}

function hueFor(playerId: string): Hue {
  const id = playerId || ''
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

function initialsFor(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface AvatarProps {
  playerId: string
  name: string
  size?: 'sm' | 'md'
  className?: string
}

export const Avatar: React.FC<AvatarProps> = ({ playerId, name, size = 'sm', className = '' }) => {
  const dims = size === 'md' ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs'

  return (
    <span
      data-testid="avatar"
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 ${BG_CLASS[hueFor(playerId)]} ${dims} ${className}`}
    >
      {initialsFor(name)}
    </span>
  )
}
