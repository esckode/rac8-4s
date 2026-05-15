/**
 * useInfiniteScroll - Pagination hook for loading more items
 *
 * Manages infinite scroll state: items, offset, hasMore
 * Calls fetchFn(offset, limit) to load more data
 */

import { useCallback, useRef, useState } from 'react'

export interface InfiniteScrollState<T> {
  items: T[]
  hasMore: boolean
  offset: number
  loadMore: () => Promise<void>
  isLoading: boolean
}

export function useInfiniteScroll<T>(
  fetchFn: (offset: number, limit: number) => Promise<T[]>,
  initialSize: number = 20
): InfiniteScrollState<T> {
  const [items, setItems] = useState<T[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const initialSizeRef = useRef(initialSize)

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) {
      return
    }

    setIsLoading(true)
    try {
      const newItems = await fetchFn(offset, initialSizeRef.current)

      if (newItems.length === 0) {
        setHasMore(false)
      } else {
        setItems(prev => [...prev, ...newItems])
        setOffset(prev => prev + newItems.length)
      }
    } catch (error) {
      console.error('Failed to load more items', error)
      setHasMore(false)
    } finally {
      setIsLoading(false)
    }
  }, [fetchFn, offset, isLoading, hasMore])

  return {
    items,
    hasMore,
    offset,
    loadMore,
    isLoading,
  }
}
