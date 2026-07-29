import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const UserIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </IconBase>
)
