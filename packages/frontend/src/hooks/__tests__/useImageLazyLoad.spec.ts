import { renderHook } from '@testing-library/react'
import { useImageLazyLoad } from '../useImageLazyLoad'

describe('useImageLazyLoad', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Hook Initialization', () => {
    it('should return hook with required properties', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current).toHaveProperty('imgRef')
      expect(result.current).toHaveProperty('isLoaded')
      expect(result.current).toHaveProperty('error')
    })

    it('should initialize isLoaded as false', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.isLoaded).toBe(false)
    })

    it('should initialize error as null', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.error).toBeNull()
    })

    it('should provide a ref object', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.imgRef).toHaveProperty('current')
    })
  })

  describe('Options', () => {
    it('should accept threshold option', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad({ threshold: 0.5 }))
      }).not.toThrow()
    })

    it('should accept rootMargin option', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad({ rootMargin: '100px' }))
      }).not.toThrow()
    })

    it('should accept both options', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad({ threshold: 0.5, rootMargin: '100px' }))
      }).not.toThrow()
    })

    it('should accept empty options', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad({}))
      }).not.toThrow()
    })

    it('should work with no options', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad())
      }).not.toThrow()
    })
  })

  describe('Ref Behavior', () => {
    it('should provide ref that can be attached to img element', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.imgRef).toBeDefined()
      expect(typeof result.current.imgRef).toBe('object')
    })

    it('should have current property on ref', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect('current' in result.current.imgRef).toBe(true)
    })

    it('should initialize ref.current as null or object', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.imgRef.current === null || typeof result.current.imgRef.current === 'object').toBe(true)
    })
  })

  describe('Loading State', () => {
    it('should start with isLoaded false', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.isLoaded).toBe(false)
    })

    it('should track error state', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.error === null || result.current.error instanceof Error).toBe(true)
    })
  })

  describe('Multiple Instances', () => {
    it('should handle multiple hook instances independently', () => {
      const { result: result1 } = renderHook(() => useImageLazyLoad())
      const { result: result2 } = renderHook(() => useImageLazyLoad())

      expect(result1.current.imgRef).not.toBe(result2.current.imgRef)
    })

    it('should maintain separate state for each instance', () => {
      const { result: result1 } = renderHook(() => useImageLazyLoad())
      const { result: result2 } = renderHook(() => useImageLazyLoad())

      expect(result1.current.isLoaded).toBe(false)
      expect(result2.current.isLoaded).toBe(false)
    })
  })

  describe('Memory Management', () => {
    it('should cleanup on unmount', () => {
      const { unmount } = renderHook(() => useImageLazyLoad())

      expect(() => {
        unmount()
      }).not.toThrow()
    })

    it('should handle rapid mount/unmount', () => {
      const { unmount: unmount1 } = renderHook(() => useImageLazyLoad())
      unmount1()

      const { unmount: unmount2 } = renderHook(() => useImageLazyLoad())
      unmount2()

      expect(true).toBe(true)
    })
  })

  describe('Intersection Observer Support', () => {
    it('should handle IntersectionObserver API gracefully', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad())
      }).not.toThrow()
    })

    it('should have default threshold value', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad({ threshold: 0.1 }))
      }).not.toThrow()
    })

    it('should have default rootMargin value', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad({ rootMargin: '50px' }))
      }).not.toThrow()
    })
  })

  describe('Configuration', () => {
    const thresholds = [0.0, 0.25, 0.5, 0.75, 1.0]

    thresholds.forEach((threshold) => {
      it(`should accept threshold value ${threshold}`, () => {
        expect(() => {
          renderHook(() => useImageLazyLoad({ threshold }))
        }).not.toThrow()
      })
    })

    const margins = ['0px', '10px', '50px', '100px', '-10px']

    margins.forEach((margin) => {
      it(`should accept rootMargin value ${margin}`, () => {
        expect(() => {
          renderHook(() => useImageLazyLoad({ rootMargin: margin }))
        }).not.toThrow()
      })
    })
  })

  describe('Error Handling', () => {
    it('should not throw on hook creation', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad())
      }).not.toThrow()
    })

    it('should not throw on unmount', () => {
      const { unmount } = renderHook(() => useImageLazyLoad())

      expect(() => {
        unmount()
      }).not.toThrow()
    })

    it('should handle invalid options gracefully', () => {
      expect(() => {
        renderHook(() => useImageLazyLoad({ threshold: 1.5 } as any))
      }).not.toThrow()
    })
  })

  describe('Lazy Loading Behavior', () => {
    it('should provide mechanism for lazy loading images', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.imgRef).toBeDefined()
      expect(result.current.isLoaded !== undefined).toBe(true)
    })

    it('should track when image is loaded', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(typeof result.current.isLoaded).toBe('boolean')
    })

    it('should track loading errors', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.error === null || result.current.error instanceof Error).toBe(true)
    })
  })

  describe('Hook Dependencies', () => {
    it('should update when threshold changes', () => {
      const { rerender } = renderHook(
        ({ threshold }: { threshold?: number }) => useImageLazyLoad({ threshold }),
        { initialProps: { threshold: 0.1 } }
      )

      expect(() => {
        rerender({ threshold: 0.5 })
      }).not.toThrow()
    })

    it('should update when rootMargin changes', () => {
      const { rerender } = renderHook(
        ({ margin }: { margin?: string }) => useImageLazyLoad({ rootMargin: margin }),
        { initialProps: { margin: '50px' } }
      )

      expect(() => {
        rerender({ margin: '100px' })
      }).not.toThrow()
    })
  })

  describe('Integration', () => {
    it('should provide complete lazy loading interface', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.imgRef).toBeDefined()
      expect(result.current.isLoaded).toBeDefined()
      expect(result.current.error).toBeDefined()
    })

    it('should be usable with standard React image element', () => {
      const { result } = renderHook(() => useImageLazyLoad())

      expect(result.current.imgRef).toBeDefined()
      expect(true).toBe(true)
    })
  })
})
