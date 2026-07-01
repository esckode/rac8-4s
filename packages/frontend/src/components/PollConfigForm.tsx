import React from 'react'

export interface PollConfig {
  autoCloseAt: string | null
  autoLaunch: boolean
  minPlayers: number | null
  launchMatchFormat: string | null
}

export interface PollConfigFormProps {
  value: PollConfig
  onChange: (config: PollConfig) => void
}

export const PollConfigForm: React.FC<PollConfigFormProps> = ({ value, onChange }) => {
  const hasCloseTime = value.autoCloseAt != null && value.autoCloseAt !== ''

  function handleCloseAtChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (!raw) {
      onChange({ ...value, autoCloseAt: null, autoLaunch: false })
    } else {
      onChange({ ...value, autoCloseAt: new Date(raw).toISOString() })
    }
  }

  function handleAutoLaunchChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, autoLaunch: e.target.checked })
  }

  function handleMinPlayersChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseInt(e.target.value, 10)
    onChange({ ...value, minPlayers: Number.isFinite(n) ? n : null })
  }

  function handleFormatChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange({ ...value, launchMatchFormat: e.target.value || null })
  }

  return (
    <div data-testid="poll-config-form" className="space-y-2">
      <div>
        <label className="text-xs text-[--ink-600]">Auto-close at</label>
        <input
          data-testid="poll-auto-close-input"
          type="datetime-local"
          value={value.autoCloseAt ? value.autoCloseAt.slice(0, 16) : ''}
          onChange={handleCloseAtChange}
          className="block w-full text-sm border border-[--border] rounded px-2 py-1 mt-0.5"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          data-testid="poll-auto-launch-toggle"
          type="checkbox"
          id="auto-launch"
          disabled={!hasCloseTime}
          checked={value.autoLaunch}
          onChange={handleAutoLaunchChange}
        />
        <label htmlFor="auto-launch" className="text-xs text-[--ink-700]">
          Auto-start tournament when poll closes
        </label>
      </div>

      {value.autoLaunch && (
        <>
          <div>
            <label className="text-xs text-[--ink-600]">Min players (optional)</label>
            <input
              data-testid="poll-min-players-input"
              type="number"
              min="1"
              value={value.minPlayers ?? ''}
              onChange={handleMinPlayersChange}
              className="block w-full text-sm border border-[--border] rounded px-2 py-1 mt-0.5"
            />
          </div>

          <div>
            <label className="text-xs text-[--ink-600]">Format</label>
            <select
              data-testid="poll-launch-format-select"
              value={value.launchMatchFormat ?? ''}
              onChange={handleFormatChange}
              className="block w-full text-sm border border-[--border] rounded px-2 py-1 mt-0.5"
            >
              <option value="">Group default</option>
              <option value="singles">Singles</option>
              <option value="doubles">Doubles</option>
            </select>
          </div>
        </>
      )}
    </div>
  )
}
