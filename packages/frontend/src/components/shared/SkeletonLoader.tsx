/**
 * SkeletonLoader - Shimmer animation placeholder for loading states
 *
 * Accepts height/width props for flexible sizing.
 * Uses smooth shimmer animation.
 */

import React from 'react'
import '../../../styles/globals.css'

export interface SkeletonLoaderProps {
  width?: string | number
  height?: string | number
  className?: string
  count?: number
  circle?: boolean
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = '20px',
  className,
  count = 1,
  circle = false,
}) => {
  const widthStyle = typeof width === 'number' ? `${width}px` : width
  const heightStyle = typeof height === 'number' ? `${height}px` : height

  const skeletons = Array.from({ length: count }).map((_, i) => (
    <div
      key={i}
      style={{ width: widthStyle, height: heightStyle }}
      className={`
        bg-[--ink-100]
        animate-pulse
        ${circle ? 'rounded-[--r-full]' : 'rounded-[--r-sm]'}
        ${className}
      `}
    />
  ))

  return <div className="space-y-[--s-3]">{skeletons}</div>
}
