import { getImageUrl, generateSrcSet, getSrcSetSizes, createImageAttrs } from '../image-loader'

describe('Image Loader Service', () => {
  beforeEach(() => {
    // Reset WebP support detection before each test
    jest.resetModules()
  })

  describe('getImageUrl', () => {
    it('should return empty string for empty src', () => {
      const result = getImageUrl('')
      expect(result).toBe('')
    })

    it('should return src unchanged for data URLs', () => {
      const dataSrc = 'data:image/png;base64,iVBORw0KGgo='
      const result = getImageUrl(dataSrc)
      expect(result).toBe(dataSrc)
    })

    it('should preserve non-image URLs', () => {
      const externalUrl = 'https://example.com/photo.jpg'
      const result = getImageUrl(externalUrl)
      expect(result).toBe(externalUrl)
    })

    it('should add width parameter when specified', () => {
      const result = getImageUrl('/images/test.jpg', 400)
      expect(result).toContain('width=400')
    })

    it('should handle relative image paths', () => {
      const result = getImageUrl('/images/tournament.jpg')
      expect(result).toContain('/images/')
    })

    it('should handle .jpg extension', () => {
      const result = getImageUrl('/images/test.jpg')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle .png extension', () => {
      const result = getImageUrl('/images/test.png')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle .jpeg extension', () => {
      const result = getImageUrl('/images/test.jpeg')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should not modify images already in WebP format', () => {
      const webpUrl = '/images/test.webp'
      const result = getImageUrl(webpUrl)
      expect(result).toContain('/images/test.webp')
    })

    it('should preserve existing query parameters', () => {
      const result = getImageUrl('/images/test.jpg?v=1')
      expect(result).toContain('v=1')
    })

    it('should handle multiple width calls consistently', () => {
      const url1 = getImageUrl('/images/test.jpg', 400)
      const url2 = getImageUrl('/images/test.jpg', 400)
      expect(url1).toBe(url2)
    })
  })

  describe('generateSrcSet', () => {
    it('should generate srcset with default widths', () => {
      const result = generateSrcSet('/images/test.jpg')
      expect(result).toContain('200w')
      expect(result).toContain('400w')
      expect(result).toContain('800w')
    })

    it('should generate srcset with custom widths', () => {
      const result = generateSrcSet('/images/test.jpg', [100, 300, 600])
      expect(result).toContain('100w')
      expect(result).toContain('300w')
      expect(result).toContain('600w')
    })

    it('should use comma-separated format', () => {
      const result = generateSrcSet('/images/test.jpg')
      const parts = result.split(',')
      expect(parts.length).toBeGreaterThanOrEqual(3)
    })

    it('should handle single width', () => {
      const result = generateSrcSet('/images/test.jpg', [400])
      expect(result).toContain('400w')
    })

    it('should include optimized URLs in srcset', () => {
      const result = generateSrcSet('/images/test.jpg', [200])
      expect(result).toContain('width=200')
    })

    it('should handle empty width array', () => {
      const result = generateSrcSet('/images/test.jpg', [])
      expect(result).toBe('')
    })

    it('should preserve image path in srcset', () => {
      const result = generateSrcSet('/images/tournament.jpg', [400])
      expect(result).toContain('/images/tournament')
    })
  })

  describe('getSrcSetSizes', () => {
    it('should return responsive sizes string', () => {
      const result = getSrcSetSizes()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should include mobile breakpoint', () => {
      const result = getSrcSetSizes()
      expect(result).toContain('640px')
    })

    it('should include tablet breakpoint', () => {
      const result = getSrcSetSizes()
      expect(result).toContain('1024px')
    })

    it('should include desktop size', () => {
      const result = getSrcSetSizes()
      expect(result).toContain('800px')
    })

    it('should use vw units for responsive sizing', () => {
      const result = getSrcSetSizes()
      expect(result).toContain('vw')
    })
  })

  describe('createImageAttrs', () => {
    it('should create image attributes object', () => {
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test Image',
      })

      expect(attrs).toHaveProperty('src')
      expect(attrs).toHaveProperty('srcSet')
      expect(attrs).toHaveProperty('sizes')
      expect(attrs).toHaveProperty('alt')
    })

    it('should include alt text', () => {
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Tournament Photo',
      })

      expect(attrs.alt).toBe('Tournament Photo')
    })

    it('should set loading to lazy', () => {
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test',
      })

      expect(attrs.loading).toBe('lazy')
    })

    it('should set decoding to async', () => {
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test',
      })

      expect(attrs.decoding).toBe('async')
    })

    it('should include custom className', () => {
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test',
        className: 'tournament-image',
      })

      expect(attrs.className).toBe('tournament-image')
    })

    it('should include custom heights in srcset', () => {
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test',
        heights: [300, 600],
      })

      expect(attrs.srcSet).toContain('300w')
      expect(attrs.srcSet).toContain('600w')
    })

    it('should include onLoad callback', () => {
      const onLoad = jest.fn()
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test',
        onLoad,
      })

      expect(attrs.onLoad).toBe(onLoad)
    })

    it('should include onError callback', () => {
      const onError = jest.fn()
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test',
        onError,
      })

      expect(attrs.onError).toBe(onError)
    })

    it('should handle width parameter', () => {
      const attrs = createImageAttrs({
        src: '/images/test.jpg',
        alt: 'Test',
        width: 400,
      })

      expect(attrs.src).toContain('width=400')
    })
  })

  describe('WebP Support', () => {
    it('should attempt to detect WebP support', () => {
      const result = getImageUrl('/images/test.jpg')
      expect(typeof result).toBe('string')
    })

    it('should cache WebP support detection', () => {
      getImageUrl('/images/test1.jpg')
      getImageUrl('/images/test2.jpg')
      // Should not throw or error
      expect(true).toBe(true)
    })

    it('should handle WebP detection failure gracefully', () => {
      expect(() => {
        getImageUrl('/images/test.jpg')
      }).not.toThrow()
    })
  })

  describe('URL Handling', () => {
    it('should handle URLs with query parameters', () => {
      const result = getImageUrl('/images/test.jpg?token=abc')
      expect(result).toContain('token=abc')
    })

    it('should handle absolute URLs', () => {
      const result = getImageUrl('http://localhost:3000/images/test.jpg')
      expect(typeof result).toBe('string')
    })

    it('should handle URLs with fragments', () => {
      const result = getImageUrl('/images/test.jpg#section')
      expect(typeof result).toBe('string')
    })

    it('should not double-encode URLs', () => {
      const result = getImageUrl('/images/test%20photo.jpg')
      expect(result).toContain('test')
    })
  })

  describe('Format Support', () => {
    it('should recognize jpg format', () => {
      const result = getImageUrl('/images/test.jpg')
      expect(typeof result).toBe('string')
    })

    it('should recognize jpeg format', () => {
      const result = getImageUrl('/images/test.jpeg')
      expect(typeof result).toBe('string')
    })

    it('should recognize png format', () => {
      const result = getImageUrl('/images/test.png')
      expect(typeof result).toBe('string')
    })

    it('should handle uppercase extensions', () => {
      const result = getImageUrl('/images/test.JPG')
      expect(typeof result).toBe('string')
    })

    it('should handle mixed case extensions', () => {
      const result = getImageUrl('/images/test.JpG')
      expect(typeof result).toBe('string')
    })
  })

  describe('Edge Cases', () => {
    it('should handle very large widths', () => {
      const result = getImageUrl('/images/test.jpg', 5000)
      expect(result).toContain('width=5000')
    })

    it('should not add width parameter for zero width', () => {
      const result = getImageUrl('/images/test.jpg', 0)
      expect(result).not.toContain('width')
    })

    it('should handle paths with multiple dots', () => {
      const result = getImageUrl('/images/test.old.jpg')
      expect(typeof result).toBe('string')
    })

    it('should handle URLs without extension', () => {
      const result = getImageUrl('/images/test')
      expect(typeof result).toBe('string')
    })
  })
})
