import React from 'react'
import { IconBase, type IconProps } from './IconBase'

export const BuildingIcon: React.FC<IconProps> = (props) => (
  <IconBase {...props}>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <rect x="8" y="7" width="2" height="2" />
    <rect x="14" y="7" width="2" height="2" />
    <rect x="8" y="11" width="2" height="2" />
    <rect x="14" y="11" width="2" height="2" />
    <rect x="10" y="16" width="4" height="5" />
  </IconBase>
)
