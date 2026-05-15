/**
 * useVirtualScroll - Virtual scrolling wrapper for react-window
 *
 * Abstracts react-window VariableSizeList configuration.
 * Returns computed width/height and item renderer for list virtualization.
 */

import { CSSProperties, useCallback, useMemo } from 'react'

export interface VirtualScrollConfig {
  width: number
  height: number
  itemCount: number
  itemSize: (index: number) => number
  overscanCount: number
}

export interface VirtualScrollResult {
  width: number
  height: number
  itemCount: number
  itemSize: (index: number) => number
  overscanCount: number
  containerStyle: CSSProperties
}

/**
 * Configure virtual scrolling for a list of items
 * @param items - Array of items to virtualize
 * @param itemSize - Function returning height of item at given index (or fixed number)
 * @param containerWidth - Width of scroll container (default: window.innerWidth)
 * @param containerHeight - Height of scroll container (default: 600px)
 */
export function useVirtualScroll<T>(
  items: T[],
  itemSize: number | ((index: number) => number) = 50,
  containerWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1024,
  containerHeight: number = 600
): VirtualScrollResult {
  const itemSizeFn = useMemo(
    () =>
      typeof itemSize === 'function'
        ? itemSize
        : () => itemSize,
    [itemSize]
  )

  const containerStyle: CSSProperties = useMemo(
    () => ({
      width: '100%',
      height: containerHeight,
      overflow: 'auto',
    }),
    [containerHeight]
  )

  return {
    width: containerWidth,
    height: containerHeight,
    itemCount: items.length,
    itemSize: itemSizeFn,
    overscanCount: 5,
    containerStyle,
  }
}
