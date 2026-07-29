import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const TrophyIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H5a2 2 0 0 0 0 4h1" />
    <path d="M17 6h2a2 2 0 0 1 0 4h-1" />
  </IconBase>
)
