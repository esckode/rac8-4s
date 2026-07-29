import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const KeyIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <circle cx="7" cy="15" r="4" />
    <path d="M10 12l9-9" />
    <path d="M16 6l2.5 2.5" />
    <path d="M13.5 8.5L16 11" />
  </IconBase>
)
