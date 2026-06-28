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

  const isOwner = groups.find(g => g.id === groupId)?.role === 'owner'

  return (
    <div className="flex flex-col h-full">
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
