import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const LogOutIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="M16 16l4-4-4-4" />
    <line x1="20" y1="12" x2="9" y2="12" />
  </IconBase>
)
