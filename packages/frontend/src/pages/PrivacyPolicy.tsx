/**
 * PrivacyPolicy — /privacy (public, S9)
 *
 * Clears the A9.2 launch gate for the whole assistant program (group @coach
 * + the 1:1 Coach). Static content — no data fetching.
 *
 * OWNER MUST REVIEW AND APPROVE THIS TEXT BEFORE THE ASSISTANT PROD CHANNEL
 * IS EVER ENABLED (ASSISTANT_ADAPTER=anthropic-aws/anthropic) — flagged in
 * the PR description per COACH_1TO1_IMPLEMENTATION.md §S9.2.
 */
import React from 'react'

export const PrivacyPolicy: React.FC = () => {
  return (
    <div data-testid="privacy-policy-page" className="max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-[--ink-900]">Privacy Policy</h1>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[--ink-800]">Who operates this app</h2>
        <p className="text-sm text-[--ink-700]">
          This app is operated by the organizer running your tournaments and groups. If you have
          questions about your data, contact your tournament organizer or group owner.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[--ink-800]">What we store</h2>
        <p className="text-sm text-[--ink-700]">
          Your account details (email, name), the matches and scores you play, the content you
          post in group chats, your app settings (timezone, notification preferences, table
          density), and the weekly availability grid you set in your profile.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[--ink-800]">AI features</h2>
        <p className="text-sm text-[--ink-700]">
          This app uses Anthropic's Claude to power an assistant called Coach, in two places:
        </p>
        <p className="text-sm text-[--ink-700]">
          <strong>Group assistant.</strong> When you @mention Coach in a group chat, your message,
          recent group chat for context, and relevant tournament data are sent to Anthropic to
          compose a reply. That reply is visible to the group.
        </p>
        <p className="text-sm text-[--ink-700]">
          <strong>Private 1:1 Coach.</strong> Every authenticated account has a private Coach
          conversation. Messages you send there, your own match data, and any memories you've
          confirmed are sent to Anthropic the same way — but replies are visible only to you,
          never to your groups.
        </p>
        <p className="text-sm text-[--ink-700]">
          <strong>Memories.</strong> Coach can remember stable facts you tell it (like a
          preference or a piece of equipment), but only after you confirm each one on a card —
          nothing is remembered silently. Your memories are listed and deletable in your Profile,
          and are included in your data export and erasure.
        </p>
        <p className="text-sm text-[--ink-700]">
          <strong>What is never sent</strong> to Anthropic: email addresses, passwords, or any
          authentication tokens.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[--ink-800]">Retention</h2>
        <p className="text-sm text-[--ink-700]">
          Group chat and your Coach conversation are kept for as long as your account and groups
          are active — there's no automatic deletion schedule. You can clear your Coach
          conversation at any time from your Profile; this deletes the conversation history but
          does not affect anything Coach remembers about you (manage memories separately).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[--ink-800]">Your rights</h2>
        <p className="text-sm text-[--ink-700]">
          You can request a full export of your data, or request erasure of your account and
          personal data, at any time by contacting your tournament organizer or group owner.
          Export and erasure both cover your matches, messages, settings, availability, and your
          Coach conversation and memories.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-[--ink-800]">Age requirement</h2>
        <p className="text-sm text-[--ink-700]">
          You must be 18 or older to use this app.
        </p>
      </section>
    </div>
  )
}
