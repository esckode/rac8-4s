import React, { useState } from 'react'

export interface LaunchConfirmSheetProps {
  inVoterNames: string[]
  defaultFormat?: 'singles' | 'doubles'
  onConfirm: (opts: { matchFormat: string }) => void
  onCancel: () => void
}

export const LaunchConfirmSheet: React.FC<LaunchConfirmSheetProps> = ({
  inVoterNames,
  defaultFormat = 'singles',
  onConfirm,
  onCancel,
}) => {
  const [matchFormat, setMatchFormat] = useState<string>(defaultFormat)

  return (
    <div
      data-testid="launch-confirm-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40"
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-[--ink-900]">Launch Tournament</h2>

        {inVoterNames.length === 0 ? (
          <p data-testid="launch-no-voters" className="text-sm text-[--ink-500]">
            No in-voters yet
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-[--ink-500] font-medium uppercase tracking-wide">Players</p>
            <ul className="space-y-0.5">
              {inVoterNames.map(name => (
                <li key={name} className="text-sm text-[--ink-800]">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="text-xs text-[--ink-600]">Format</label>
          <select
            data-testid="launch-format-select"
            value={matchFormat}
            onChange={e => setMatchFormat(e.target.value)}
            className="block w-full mt-0.5 text-sm border border-[--border] rounded px-2 py-1.5"
          >
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            data-testid="launch-cancel-button"
            onClick={onCancel}
            className="flex-1 py-2 text-sm border border-[--border] rounded-lg text-[--ink-700] hover:bg-[--ink-50]"
          >
            Cancel
          </button>
          <button
            data-testid="launch-confirm-button"
            onClick={() => onConfirm({ matchFormat })}
            className="flex-1 py-2 text-sm bg-[--court-500] text-white rounded-lg font-medium hover:bg-[--court-600]"
          >
            Confirm Launch
          </button>
        </div>
      </div>
    </div>
  )
}
