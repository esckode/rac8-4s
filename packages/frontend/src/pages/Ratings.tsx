/**
 * Ratings — /ratings
 *
 * ISSUE-59: moved out of Profile, which should focus on account settings
 * and preferences, not statistics. Current rating per sport/format (with
 * the provisional flag) plus the last-10-partners list — the two elements
 * that already have data behind them (rating trend, head-to-head, and
 * per-format W/L are not yet built; see UAT_ISSUES.md#issue-59).
 */
import React, { useEffect, useState } from 'react'
import { fetchPlayerRatings, PlayerRatingsResponse, fetchPlayerPartners, PlayerPartnersResponse } from '../api/client'

export const Ratings: React.FC = () => {
  const [ratings, setRatings] = useState<PlayerRatingsResponse | null>(null)
  const [partners, setPartners] = useState<PlayerPartnersResponse | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return

    fetchPlayerRatings(token)
      .then(data => setRatings(data))
      .catch(() => {})

    fetchPlayerPartners(token)
      .then(data => setPartners(data))
      .catch(() => {})
  }, [])

  return (
    <div data-testid="ratings-page" className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-(--ink-900)">Ratings</h1>

      <section className="rounded-xl border border-(--border) p-4 bg-(--surface) space-y-3">
        <h2 className="text-base font-semibold text-(--ink-800)">Your Rating</h2>

        {ratings && ratings.ratings.length > 0 ? (
          <div className="space-y-4">
            {Array.from(
              new Map(
                ratings.ratings.map(r => [r.sport, r])
              ).entries()
            ).map(([sport]) => {
              const sportRatings = ratings.ratings.filter(r => r.sport === sport)
              return (
                <div key={sport} className="space-y-2">
                  <h3 className="text-sm font-semibold text-(--ink-800)">{sport}</h3>
                  {sportRatings.map(rating => (
                    <div
                      key={`${sport}-${rating.format}`}
                      data-testid={`rating-${sport}-${rating.format}`}
                      className="flex items-center justify-between py-2 px-2 bg-(--surface-alt) rounded"
                    >
                      <span className="text-sm text-(--ink-700)">{rating.format}</span>
                      <span className="text-sm font-semibold text-(--ink-900)">
                        {rating.rating}
                        {rating.provisional && <span className="text-(--ink-500) ml-1">(provisional)</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          <div
            data-testid="rating-empty-state"
            className="py-4 text-center text-(--ink-500)"
          >
            <p className="text-sm">You have not yet played any matches</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-(--border) p-4 bg-(--surface) space-y-3">
        <h2 className="text-base font-semibold text-(--ink-800)">Recent Partners</h2>

        {partners && partners.partners.length > 0 ? (
          <div className="space-y-2">
            {partners.partners.map(partner => (
              <div
                key={partner.playerId}
                data-testid={`partner-${partner.playerId}`}
                className="flex items-center justify-between py-2 px-2 bg-(--surface-alt) rounded"
              >
                <span className="text-sm text-(--ink-700)">{partner.name}</span>
                <span className="text-xs text-(--ink-500)">{new Date(partner.lastPartneredAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <div
            data-testid="partners-empty-state"
            className="py-4 text-center text-(--ink-500)"
          >
            <p className="text-sm">No doubles partners yet</p>
          </div>
        )}
      </section>
    </div>
  )
}
