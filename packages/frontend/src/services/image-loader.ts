let webpSupported: boolean | null = null

const detectWebPSupport = (): boolean => {
  if (webpSupported !== null) return webpSupported

  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupported = canvas.toDataURL('image/webp').includes('webp')
  } catch {
    webpSupported = false
  }

  return webpSupported
}

export const getImageUrl = (src: string, width?: number): string => {
  if (!src) return ''

  const url = new URL(src, window.location.origin)
  const pathname = url.pathname
  const searchParams = url.searchParams

  // Don't optimize if already a data URL or external CDN
  if (src.startsWith('data:') || !pathname.includes('/images/')) {
    return src
  }

  // Add WebP conversion if supported
  if (detectWebPSupport()) {
    const ext = pathname.split('.').pop()?.toLowerCase()
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
      const newPath = pathname.replace(/\.(jpg|jpeg|png)$/i, '.webp')
      searchParams.set('format', 'webp')
      url.pathname = newPath
    }
  }

  // Add width parameter for resizing
  if (width) {
    searchParams.set('width', width.toString())
  }

  return url.toString()
}

export const generateSrcSet = (src: string, widths: number[] = [200, 400, 800]): string => {
  return widths
    .map((width) => {
      const optimizedUrl = getImageUrl(src, width)
      return `${optimizedUrl} ${width}w`
    })
    .join(', ')
}

export const getSrcSetSizes = (): string => {
  return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px'
}

export interface ImageLoaderOptions {
  src: string
  alt: string
  width?: number
  heights?: number[]
  className?: string
  onLoad?: () => void
  onError?: () => void
}

export const createImageAttrs = (options: ImageLoaderOptions) => {
  const { src, alt, width, heights = [200, 400, 800], className, onLoad, onError } = options

  return {
    src: getImageUrl(src, width),
    srcSet: generateSrcSet(src, heights),
    sizes: getSrcSetSizes(),
    alt,
    className,
    loading: 'lazy' as const,
    decoding: 'async' as const,
    onLoad,
    onError,
  }
}
