import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const UsersIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M15.5 14.5c2.5.3 4.5 2.4 4.5 5.5" />
  </IconBase>
)
