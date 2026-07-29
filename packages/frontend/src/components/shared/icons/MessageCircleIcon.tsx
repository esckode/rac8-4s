import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const MessageCircleIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.4-3.5A7.9 7.9 0 0 1 4 12z" />
  </IconBase>
)
