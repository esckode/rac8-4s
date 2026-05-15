import React from 'react'

export interface PaginationControlsProps {
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  className?: string
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  hasMore,
  isLoading,
  onLoadMore,
  className = '',
}) => {
  if (!hasMore) {
    return null
  }

  return (
    <div className={`flex justify-center py-[--s-8] ${className}`}>
      <button
        onClick={onLoadMore}
        disabled={isLoading}
        className="px-[--s-6] py-[--s-3] bg-[--court-500] text-white rounded-[--r-lg] font-medium hover:bg-[--court-600] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Load more items"
      >
        {isLoading ? (
          <span className="flex items-center gap-[--s-2]">
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Loading...
          </span>
        ) : (
          'Load More'
        )}
      </button>
    </div>
  )
}

export default PaginationControls
