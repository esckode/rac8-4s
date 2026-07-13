/**
 * MyGroups — G2.5 + P1.6
 *
 * Components:
 *   GroupList          — /groups route. Lists the player's groups.
 *   GroupDetail        — /groups/:groupId route. Chat · Members · Invite tabs.
 *   GroupSettings      — /groups/:groupId/settings. Preferences + owner management.
 *   ManageMembersList  — Owner-only member management rows (promote/demote/kick).
 *   KickConfirmDialog  — Accessible modal confirming kick action.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useGroupList } from '../hooks/useGroupList'
import { useAuth } from '../hooks/useAuth'
import { GroupChatPanel, MembersPanel, type MemberSummary } from '../components/GroupChatPanel'
import { NotifyLevelControl, type NotifyLevel } from '../components/NotifyLevelControl'
import { LeaderboardPanel, type IndividualRow } from '../components/LeaderboardPanel'

// ─── GearIcon ─────────────────────────────────────────────────────────────────

const GearIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

// ─── GroupList ────────────────────────────────────────────────────────────────

export const GroupList: React.FC = () => {
  const { groups, loading, error } = useGroupList()

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-[--ink-600]">Loading your groups…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <p data-testid="group-list-error" className="text-[--rose-700]">{error}</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="p-4 text-center">
        <p
          data-testid="group-list-empty"
          className="text-[--ink-500]"
        >
          No groups yet. Ask a group owner to invite you.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-[--s-3] p-4">
      <h1 className="text-2xl font-bold text-[--ink-900]">My Groups</h1>
      {groups.map(g => (
        <Link
          key={g.id}
          to={`/groups/${g.id}`}
          data-testid="group-list-item"
          className="flex items-center justify-between p-4 bg-white border border-[--border] rounded-xl hover:shadow-md transition-shadow"
        >
          <div>
            <span className="font-semibold text-[--ink-900]">{g.name}</span>
            <span className="ml-2 text-xs text-[--ink-500]">{g.memberCount} members</span>
          </div>
          {g.role === 'owner' && (
            <span className="text-xs font-medium text-[--court-600]">Owner</span>
          )}
        </Link>
      ))}
    </div>
  )
}

// ─── GroupDetail ──────────────────────────────────────────────────────────────

type GroupTab = 'chat' | 'members' | 'leaderboard'

export const GroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const [activeTab, setActiveTab] = useState<GroupTab>('chat')
  const [lbRows, setLbRows] = useState<IndividualRow[]>([])
  const [lbLoading, setLbLoading] = useState(false)
  const { groups } = useGroupList()

  useEffect(() => {
    if (activeTab !== 'leaderboard' || !groupId) return
    const token = localStorage.getItem('auth_token')
    setLbLoading(true)
    fetch(`/player/groups/${groupId}/leaderboard/individual`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setLbRows(data.leaderboard ?? []))
      .finally(() => setLbLoading(false))
  }, [activeTab, groupId])

  if (!groupId) return null

  const group = groups.find(g => g.id === groupId)
  const isOwner = group?.role === 'owner'
  const groupName = group?.name ?? ''

  return (
    <div className="flex flex-col h-full">
      {/* Group header */}
      <header
        data-testid="group-detail-header"
        className="flex items-center justify-between px-4 py-3 border-b border-[--border] bg-[--surface]"
      >
        <h2 className="text-xl font-bold text-[--ink-900]">{groupName}</h2>
        <Link
          to={`/groups/${groupId}/settings`}
          data-testid="group-settings-gear"
          aria-label="Group settings"
          className="p-2 rounded-full text-[--ink-500] hover:bg-[--ink-100] hover:text-[--ink-700] transition-colors"
        >
          <GearIcon className="w-5 h-5" />
        </Link>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-[--border]">
        <button
          data-testid="group-tab-chat"
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 text-sm font-medium ${activeTab === 'chat' ? 'text-[--court-600] border-b-2 border-[--court-600]' : 'text-[--ink-500]'}`}
        >
          Chat
        </button>
        <button
          data-testid="group-tab-members"
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-3 text-sm font-medium ${activeTab === 'members' ? 'text-[--court-600] border-b-2 border-[--court-600]' : 'text-[--ink-500]'}`}
        >
          Members
        </button>
        <button
          data-testid="group-tab-leaderboard"
          onClick={() => setActiveTab('leaderboard')}
          className={`flex-1 py-3 text-sm font-medium ${activeTab === 'leaderboard' ? 'text-[--court-600] border-b-2 border-[--court-600]' : 'text-[--ink-500]'}`}
        >
          Leaderboard
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <GroupChatPanel
            groupId={groupId}
            active
            isOwner={isOwner}
            assistantEnabled={group?.assistantEnabled ?? true}
          />
        )}
        {activeTab === 'members' && <MembersPanel groupId={groupId} />}
        {activeTab === 'leaderboard' && (
          <div className="p-4 overflow-y-auto h-full">
            <LeaderboardPanel individuals={lbRows} pairs={[]} loading={lbLoading} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── KickConfirmDialog ────────────────────────────────────────────────────────

interface KickConfirmDialogProps {
  memberName: string
  onConfirm: () => void
  onCancel: () => void
}

const KickConfirmDialog: React.FC<KickConfirmDialogProps> = ({ memberName, onConfirm, onCancel }) => {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus the cancel button when dialog opens
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Dismiss on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Trap focus within dialog
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[--ink-900]/50"
      aria-modal="true"
      role="dialog"
      aria-labelledby="kick-dialog-title"
      data-testid="kick-confirm-dialog"
      onKeyDown={handleKeyDown}
      ref={dialogRef}
    >
      <div className="bg-[--surface] rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
        <h2 id="kick-dialog-title" className="text-base font-semibold text-[--ink-900]">
          Remove {memberName}?
        </h2>
        <p className="text-sm text-[--ink-600]">
          {memberName} will be removed from the group and lose access to all group content.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[--ink-700] hover:text-[--ink-900] rounded-lg hover:bg-[--ink-100] transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="kick-confirm-button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-[--rose-700] hover:bg-[--rose-900] rounded-lg transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ManageMembersList ────────────────────────────────────────────────────────

interface ManageMembersListProps {
  groupId: string
  selfPlayerId: string
}

const ManageMembersList: React.FC<ManageMembersListProps> = ({ groupId, selfPlayerId }) => {
  const [members, setMembers] = useState<MemberSummary[]>([])
  const [kickTarget, setKickTarget] = useState<MemberSummary | null>(null)
  const [lastOwnerError, setLastOwnerError] = useState(false)

  const fetchMembers = useCallback(() => {
    const token = localStorage.getItem('auth_token')
    fetch(`/player/groups/${groupId}/members`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(res => res.ok ? res.json() : null)
      .then((data: { members: MemberSummary[] } | null) => {
        if (data?.members) setMembers(data.members)
      })
      .catch(() => {})
  }, [groupId])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  async function callAction(method: 'POST' | 'DELETE', url: string) {
    setLastOwnerError(false)
    const token = localStorage.getItem('auth_token')
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { code?: string }
      if (body.code === 'LAST_OWNER') {
        setLastOwnerError(true)
        return
      }
    }
    fetchMembers()
  }

  async function handlePromote(playerId: string) {
    await callAction('POST', `/player/groups/${groupId}/members/${playerId}/promote`)
  }

  async function handleDemote(playerId: string) {
    await callAction('POST', `/player/groups/${groupId}/members/${playerId}/demote`)
  }

  async function handleKickConfirm() {
    if (!kickTarget) return
    const targetId = kickTarget.playerId
    setKickTarget(null)
    await callAction('DELETE', `/player/groups/${groupId}/members/${targetId}`)
  }

  return (
    <>
      <div data-testid="manage-members-list" className="mt-4 space-y-2">
        <h3 className="text-sm font-semibold text-[--ink-700] uppercase tracking-wide">Members</h3>

        {lastOwnerError && (
          <p
            data-testid="last-owner-error"
            className="text-sm text-[--rose-700] bg-[--rose-50] rounded-lg px-3 py-2"
          >
            Can&apos;t remove the last owner — promote another member first
          </p>
        )}

        {members.map(m => (
          <div
            key={m.playerId}
            data-testid={`member-row-${m.playerId}`}
            className="flex items-center justify-between py-2 px-1 border-b border-[--border] last:border-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-[--ink-900]">{m.name}</span>
              {m.role === 'owner' && (
                <span className="text-xs font-medium text-[--court-600]">Owner</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {m.role === 'member' && (
                <button
                  data-testid="promote-button"
                  onClick={() => handlePromote(m.playerId)}
                  className="text-xs font-medium text-[--court-600] hover:text-[--court-800] px-2 py-1 rounded hover:bg-[--court-50] transition-colors"
                  aria-label={`Promote ${m.name} to owner`}
                >
                  Promote
                </button>
              )}
              {m.role === 'owner' && m.playerId !== selfPlayerId && (
                <button
                  data-testid="demote-button"
                  onClick={() => handleDemote(m.playerId)}
                  className="text-xs font-medium text-[--ink-500] hover:text-[--ink-700] px-2 py-1 rounded hover:bg-[--ink-100] transition-colors"
                  aria-label={`Demote ${m.name} to member`}
                >
                  Demote
                </button>
              )}
              <button
                data-testid="kick-button"
                onClick={() => setKickTarget(m)}
                className="text-xs font-medium text-[--rose-700] hover:text-[--rose-900] px-2 py-1 rounded hover:bg-[--rose-50] transition-colors"
                aria-label={`Remove ${m.name} from group`}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {kickTarget && (
        <KickConfirmDialog
          memberName={kickTarget.name}
          onConfirm={handleKickConfirm}
          onCancel={() => setKickTarget(null)}
        />
      )}
    </>
  )
}

// ─── GroupConfig ──────────────────────────────────────────────────────────────

interface GroupConfigProps {
  groupId: string
  initialName: string
  initialFormat: 'singles' | 'doubles'
  initialAssistantEnabled: boolean
  initialDigestEnabled: boolean
}

const GroupConfig: React.FC<GroupConfigProps> = ({
  groupId,
  initialName,
  initialFormat,
  initialAssistantEnabled,
  initialDigestEnabled,
}) => {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [assistantEnabled, setAssistantEnabled] = useState(initialAssistantEnabled)
  const [digestEnabled, setDigestEnabled] = useState(initialDigestEnabled)

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/groups/${groupId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: trimmed }),
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleFormatChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const defaultMatchFormat = e.target.value as 'singles' | 'doubles'
    const token = localStorage.getItem('auth_token')
    await fetch(`/player/groups/${groupId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ defaultMatchFormat }),
    })
  }

  async function handleAssistantToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setAssistantEnabled(next)
    const token = localStorage.getItem('auth_token')
    await fetch(`/player/groups/${groupId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ assistantEnabled: next }),
    })
  }

  async function handleDigestToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setDigestEnabled(next)
    const token = localStorage.getItem('auth_token')
    await fetch(`/player/groups/${groupId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ digestEnabled: next }),
    })
  }

  return (
    <div className="mt-6 pt-4 border-t border-[--border] space-y-4">
      <h3 className="text-sm font-semibold text-[--ink-700] uppercase tracking-wide">Group Config</h3>

      {/* Rename */}
      <form onSubmit={handleSaveName} className="flex gap-2 items-center">
        <label htmlFor="group-name-input" className="sr-only">Group name</label>
        <input
          id="group-name-input"
          data-testid="group-name-input"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 text-sm border border-[--border] rounded-lg px-3 py-2 text-[--ink-900] bg-[--surface] focus:outline-none focus:ring-2 focus:ring-[--court-400]"
          aria-label="Group name"
        />
        <button
          data-testid="group-name-save"
          type="submit"
          disabled={saving || !name.trim()}
          className="text-sm font-medium text-[--court-600] hover:text-[--court-800] px-3 py-2 rounded-lg hover:bg-[--court-50] transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      {/* Match format */}
      <div className="flex items-center gap-3">
        <label htmlFor="match-format-select" className="text-sm text-[--ink-700]">
          Default match format
        </label>
        <select
          id="match-format-select"
          data-testid="match-format-select"
          defaultValue={initialFormat}
          onChange={handleFormatChange}
          className="text-sm border border-[--border] rounded-lg px-3 py-2 text-[--ink-900] bg-[--surface] focus:outline-none focus:ring-2 focus:ring-[--court-400]"
        >
          <option value="singles">Singles</option>
          <option value="doubles">Doubles</option>
        </select>
      </div>

      {/* Assistant toggle */}
      <div className="flex items-center gap-3">
        <label htmlFor="assistant-toggle" className="text-sm text-[--ink-700]">
          Coach assistant
        </label>
        <input
          id="assistant-toggle"
          data-testid="assistant-toggle"
          type="checkbox"
          role="switch"
          checked={assistantEnabled}
          onChange={handleAssistantToggle}
          className="h-5 w-5 accent-[--court-600]"
          aria-label="Enable Coach assistant"
        />
      </div>

      {/* Digest toggle — only meaningful while the assistant is enabled */}
      {assistantEnabled && (
        <div className="flex items-center gap-3">
          <label htmlFor="digest-toggle" className="text-sm text-[--ink-700]">
            Weekly digest
          </label>
          <input
            id="digest-toggle"
            data-testid="digest-toggle"
            type="checkbox"
            role="switch"
            checked={digestEnabled}
            onChange={handleDigestToggle}
            className="h-5 w-5 accent-[--court-600]"
            aria-label="Enable weekly digest"
          />
        </div>
      )}
    </div>
  )
}

// ─── GroupSettings ────────────────────────────────────────────────────────────

/**
 * GroupSettings — /groups/:groupId/settings
 *
 * Member section (P1.5): notify-level control + leave action.
 * Owner section (P1.6): ManageMembersList + group config (rename + match format).
 */
export const GroupSettings: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const { groups } = useGroupList()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  if (!groupId) return null

  const group = groups.find(g => g.id === groupId)
  const isOwner = group?.role === 'owner'
  const playerId = user?.playerId ?? ''
  const currentLevel: NotifyLevel = 'mentions_polls'
  const groupName = group?.name ?? ''

  async function handleLeave() {
    if (leaving || !playerId) return
    setLeaving(true)
    try {
      const token = localStorage.getItem('auth_token')
      await fetch(`/player/groups/${groupId}/members/${playerId}/leave`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      navigate('/groups')
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div data-testid="group-settings-page" className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-[--ink-900]">Group Settings</h1>

      {/* Member-visible section — notify-level + leave */}
      <section
        data-testid="group-settings-member-section"
        className="rounded-xl border border-[--border] p-4 bg-[--surface]"
      >
        <h2 className="text-base font-semibold text-[--ink-800]">Preferences</h2>

        {playerId && (
          <NotifyLevelControl
            groupId={groupId}
            playerId={playerId}
            currentLevel={currentLevel}
          />
        )}

        <div className="mt-6 pt-4 border-t border-[--border]">
          <button
            data-testid="leave-group-button"
            onClick={handleLeave}
            disabled={leaving}
            className="text-sm font-medium text-[--rose-700] hover:text-[--rose-900] disabled:opacity-50"
          >
            {leaving ? 'Leaving…' : 'Leave group'}
          </button>
        </div>
      </section>

      {/* Owner-only section — member management + group config */}
      {isOwner && (
        <section
          data-testid="group-settings-owner-section"
          className="rounded-xl border border-[--border] p-4 bg-[--surface]"
        >
          <h2 className="text-base font-semibold text-[--ink-800]">Group Management</h2>

          <ManageMembersList groupId={groupId} selfPlayerId={playerId} />

          <GroupConfig
            groupId={groupId}
            initialName={groupName}
            initialFormat="singles"
            initialAssistantEnabled={group?.assistantEnabled ?? true}
            initialDigestEnabled={group?.digestEnabled ?? false}
          />
        </section>
      )}
    </div>
  )
}
