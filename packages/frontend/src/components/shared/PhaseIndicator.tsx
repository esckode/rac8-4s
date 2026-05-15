import React from 'react'
import { Badge } from './Badge'
import '../../../styles/globals.css'

export interface PhaseIndicatorProps {
  phase: 'group' | 'knockout'
  size?: 'sm' | 'md'
  className?: string
}

export const PhaseIndicator: React.FC<PhaseIndicatorProps> = ({
  phase,
  size = 'md',
  className,
}) => {
  const label = phase === 'group' ? 'Group Stage' : 'Knockout'

  const sizeClasses = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <div className={`${sizeClasses} ${className}`}>
      <Badge variant={phase}>
        {label.toUpperCase()}
      </Badge>
    </div>
  )
}
