import React from 'react'

export interface MixerStatePanelProps {
  rosterById: Record<string, string>
  activePlayerIds: string[]
}

export const MixerStatePanel: React.FC<MixerStatePanelProps> = ({
  rosterById,
  activePlayerIds,
}) => {
  const activeSet = new Set(activePlayerIds)
  const sittingOut = Object.entries(rosterById)
    .filter(([id]) => !activeSet.has(id))
    .map(([, name]) => name)
    .sort()

  return (
    <div data-testid="mixer-state-panel" className="p-[--s-3] bg-[--surface-50] rounded-[--r-md]">
      {sittingOut.length === 0 ? (
        <p data-testid="mixer-all-active" className="text-sm text-[--ink-500]">
          Everyone is playing
        </p>
      ) : (
        <div>
          <p className="text-xs font-medium text-[--ink-600] mb-[--s-1]">Sitting out this round</p>
          <ul data-testid="sitting-out-list" className="text-sm text-[--ink-700] flex flex-wrap gap-[--s-1]">
            {sittingOut.map(name => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
