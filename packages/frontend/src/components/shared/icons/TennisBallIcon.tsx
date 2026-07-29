import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const TennisBallIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M4.5 6.5c3 3 3 8 0 11" />
    <path d="M19.5 6.5c-3 3-3 8 0 11" />
  </IconBase>
)
