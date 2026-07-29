import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const BellIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <path d="M12 4a5 5 0 0 0-5 5v3.5c0 1-.4 2-1.2 2.7L4.5 16.5h15l-1.3-1.3A4 4 0 0 1 17 12.5V9a5 5 0 0 0-5-5z" />
    <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
  </IconBase>
)
