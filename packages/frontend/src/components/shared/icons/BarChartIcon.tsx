import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const BarChartIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="6" y="13" width="3" height="7" />
    <rect x="11" y="9" width="3" height="11" />
    <rect x="16" y="5" width="3" height="15" />
  </IconBase>
)
