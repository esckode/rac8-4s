/**
 * S3.3/S3.4 — Identity avatars (P3): initials + deterministic color.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { Avatar } from '../Avatar'

describe('Avatar', () => {
  it('renders two initials for a two-word name', () => {
    render(<Avatar playerId="p1" name="Alice Smith" />)
    expect(screen.getByTestId('avatar')).toHaveTextContent('AS')
  })

  it('renders up to two initials for a one-word name', () => {
    render(<Avatar playerId="p1" name="Cher" />)
    expect(screen.getByTestId('avatar')).toHaveTextContent('CH')
  })

  it('uses the first and last word for a multi-word name', () => {
    render(<Avatar playerId="p1" name="Mary Jane Watson" />)
    expect(screen.getByTestId('avatar')).toHaveTextContent('MW')
  })

  it('falls back to "?" for an empty name', () => {
    render(<Avatar playerId="p1" name="" />)
    expect(screen.getByTestId('avatar')).toHaveTextContent('?')
  })

  it('the same player id always gets the same background color', () => {
    const { container: c1 } = render(<Avatar playerId="stable-id" name="Alice" />)
    const { container: c2 } = render(<Avatar playerId="stable-id" name="Alice" />)
    expect(c1.querySelector('[data-testid="avatar"]')?.className).toBe(
      c2.querySelector('[data-testid="avatar"]')?.className
    )
  })

  it('different player ids can get different colors (spread check)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `player_${i}`)
    const classNames = new Set(
      ids.map(id => {
        const { container } = render(<Avatar playerId={id} name="Test" />)
        return container.querySelector('[data-testid="avatar"]')?.className
      })
    )
    // 20 ids over a small curated palette should hit more than one color.
    expect(classNames.size).toBeGreaterThan(1)
  })

  it('is hidden from assistive tech (decorative, name is shown elsewhere)', () => {
    render(<Avatar playerId="p1" name="Alice" />)
    expect(screen.getByTestId('avatar')).toHaveAttribute('aria-hidden', 'true')
  })
})
