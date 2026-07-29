import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const InfoIcon: React.FC<IconProps> = ({ color = 'currentColor', ...props }) => (
  <IconBase color={color} {...props}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <circle cx="12" cy="7.5" r="0.6" fill={color} stroke="none" />
  </IconBase>
)
