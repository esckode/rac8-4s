/**
 * MyGroups — G2.5
 *
 * Two components:
 *   GroupList   — /groups route. Lists the player's groups.
 *   GroupDetail — /groups/:groupId route. Chat · Members · Invite tabs.
 */

import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useGroupList } from '../hooks/useGroupList'
import { GroupChatPanel, MembersPanel } from '../components/GroupChatPanel'

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

type GroupTab = 'chat' | 'members'

export const GroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const [activeTab, setActiveTab] = useState<GroupTab>('chat')
  const { groups } = useGroupList()

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
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <GroupChatPanel groupId={groupId} active isOwner={isOwner} />}
        {activeTab === 'members' && <MembersPanel groupId={groupId} />}
      </div>
    </div>
  )
}

// ─── GroupSettings ────────────────────────────────────────────────────────────

/**
 * GroupSettings — /groups/:groupId/settings
 *
 * Scaffold only (P1.4). Sections are filled in by P1.5 (owner management)
 * and P1.6 (member preferences). Role-gating is enforced here.
 */
export const GroupSettings: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const { groups } = useGroupList()

  if (!groupId) return null

  const isOwner = groups.find(g => g.id === groupId)?.role === 'owner'

  return (
    <div data-testid="group-settings-page" className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-[--ink-900]">Group Settings</h1>

      {/* Member-visible section — preferences, notifications, etc. (P1.6) */}
      <section
        data-testid="group-settings-member-section"
        className="rounded-xl border border-[--border] p-4 bg-[--surface]"
      >
        <h2 className="text-base font-semibold text-[--ink-800]">Preferences</h2>
        <p className="mt-1 text-sm text-[--ink-500]">Notification and display settings coming soon.</p>
      </section>

      {/* Owner-only section — group management, invite controls, etc. (P1.5) */}
      {isOwner && (
        <section
          data-testid="group-settings-owner-section"
          className="rounded-xl border border-[--border] p-4 bg-[--surface]"
        >
          <h2 className="text-base font-semibold text-[--ink-800]">Group Management</h2>
          <p className="mt-1 text-sm text-[--ink-500]">Owner controls coming soon.</p>
        </section>
      )}
    </div>
  )
}
