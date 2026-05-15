import { useEffect, useRef, useState } from 'react'

export interface UseImageLazyLoadOptions {
  threshold?: number
  rootMargin?: string
}

export const useImageLazyLoad = (options: UseImageLazyLoadOptions = {}) => {
  const { threshold = 0.1, rootMargin = '50px' } = options
  const imgRef = useRef<HTMLImageElement>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return

    // Check if Intersection Observer is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: load image immediately if IntersectionObserver not supported
      img.classList.remove('lazy-loading')
      img.classList.add('lazy-loaded')
      setIsLoaded(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Load image when visible
          const dataSrc = img.dataset.src
          const dataSrcSet = img.dataset.srcset

          if (dataSrc) {
            img.src = dataSrc
          }
          if (dataSrcSet) {
            img.srcset = dataSrcSet
          }

          // Handle load event
          img.onload = () => {
            img.classList.remove('lazy-loading')
            img.classList.add('lazy-loaded')
            setIsLoaded(true)
            observer.unobserve(img)
          }

          // Handle error event
          img.onerror = () => {
            img.classList.remove('lazy-loading')
            img.classList.add('lazy-error')
            setError(new Error('Failed to load image'))
            observer.unobserve(img)
          }

          observer.unobserve(img)
        }
      },
      {
        threshold,
        rootMargin,
      }
    )

    observer.observe(img)

    return () => {
      if (img) {
        observer.unobserve(img)
      }
    }
  }, [threshold, rootMargin])

  return { imgRef, isLoaded, error }
}
