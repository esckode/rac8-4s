import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/shared/Button'
import { LogoMark } from '../components/shared/LogoMark'

interface FormErrors {
  email?: string
  password?: string
}

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const formatCountdown = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // P0.2 — ticks the 429 retry countdown down once per second, re-enabling
  // the form at zero.
  useEffect(() => {
    if (retryAfterSeconds === null) return undefined
    if (retryAfterSeconds <= 0) {
      setRetryAfterSeconds(null)
      return undefined
    }
    const timer = setTimeout(() => setRetryAfterSeconds(retryAfterSeconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [retryAfterSeconds])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }


  const handleEmailBlur = () => {
    if (formData.email && !validateEmail(formData.email)) {
      setErrors(prev => ({ ...prev, email: 'Please enter a valid email' }))
    } else {
      setErrors(prev => {
        const { email, ...rest } = prev
        return rest
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    setRetryAfterSeconds(null)

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      await authLogin(formData.email, formData.password)
      // Clear form and redirect
      setFormData({ email: '', password: '' })
      navigate('/browse')
    } catch (err) {
      const rateLimitErr = err as Error & { status?: number; retryAfterSeconds?: number }
      setLoading(false)
      if (rateLimitErr.status === 429) {
        setApiError('Too many attempts.')
        setRetryAfterSeconds(rateLimitErr.retryAfterSeconds ?? null)
      } else {
        setApiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e as any)
    }
  }

  const isRateLimited = retryAfterSeconds !== null
  const isFormValid = formData.email && formData.password && !errors.email && !errors.password

  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: 'linear-gradient(180deg, var(--auth-bg-top) 0%, var(--auth-bg-bottom) 100%)',
        fontFamily: 'var(--font-ui)',
        color: 'var(--auth-glass-text)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        margin: '0 auto',
      }}
    >
      {/* Decorative blobs */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none', filter: 'blur(0.5px)' }}>
        <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <circle cx="320" cy="120" r="180" fill="var(--court-400)" opacity="0.5" />
          <circle cx="60" cy="500" r="200" fill="var(--lavender-400)" opacity="0.4" />
        </svg>
      </div>

      {/* Header with back button and logo */}
      <div
        style={{
          padding: '12px 24px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <button
          onClick={() => navigate('/')}
          tabIndex={-1}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '1px solid var(--auth-glass-border)',
            background: 'var(--auth-glass-bg-hover)',
            color: 'var(--auth-glass-text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(12px)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <LogoMark size={28} color="var(--court-300)" accent="var(--court-400)" />
        <div style={{ width: 40 }} />
      </div>

      {/* Form content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          padding: '24px 28px 32px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            color: 'var(--auth-glass-text)',
            marginBottom: 10,
          }}
        >
          Welcome back.
        </div>
        <div style={{ fontSize: 15, color: 'var(--auth-glass-text-muted)', lineHeight: 1.5 }}>
          Sign in to see your matches, standings, and tonight's tournaments.
        </div>

        {/* Error message */}
        {apiError && (
          <div
            role="alert"
            data-testid={isRateLimited ? 'login-rate-limit-error' : undefined}
            style={{
              marginTop: 22,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              background: 'var(--auth-danger-wash-strong)',
              border: '1px solid var(--auth-danger-border)',
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.45,
              color: 'var(--auth-danger-text)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--auth-danger)" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" />
              <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">!</text>
            </svg>
            <div style={{ flex: 1 }}>
              <strong style={{ color: 'var(--auth-glass-text)' }}>{apiError}</strong>
              {isRateLimited && (
                <div data-testid="login-retry-countdown" style={{ marginTop: 4 }}>
                  Try again in {formatCountdown(retryAfterSeconds as number)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Form fields */}
        <div style={{ marginTop: apiError ? 18 : 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Email field */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--auth-glass-text-strong)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Email
            </label>
            <input
              ref={emailInputRef}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              onBlur={handleEmailBlur}
              onKeyPress={handleKeyPress}
              placeholder="Enter your email"
              disabled={isRateLimited}
              style={{
                width: '100%',
                height: 52,
                padding: '0 14px',
                background: errors.email ? 'var(--auth-danger-wash)' : 'var(--auth-glass-bg)',
                border: errors.email ? '1.5px solid var(--auth-danger)' : '1px solid var(--auth-glass-border)',
                borderRadius: 14,
                boxShadow: errors.email ? '0 0 0 4px var(--auth-danger-ring)' : 'none',
                fontSize: 15,
                fontFamily: 'var(--font-ui)',
                color: formData.email ? 'var(--auth-glass-text)' : 'var(--auth-glass-placeholder)',
                letterSpacing: '-0.005em',
                fontWeight: formData.email ? 500 : 500,
                transition: 'all .15s ease',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {errors.email && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--auth-danger-text)',
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--auth-danger)' }} />
                {errors.email}
              </div>
            )}
          </div>

          {/* Password field */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--auth-glass-text-strong)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              <label style={{ fontWeight: 700, color: 'var(--auth-glass-text-strong)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Password</label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                tabIndex={-1}
                style={{
                  fontWeight: 700,
                  color: 'var(--court-300)',
                  textTransform: 'none',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                Forgot password?
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 52,
                padding: '0 14px',
                background: errors.password ? 'var(--auth-danger-wash)' : 'var(--auth-glass-bg)',
                border: errors.password ? '1.5px solid var(--auth-danger)' : '1px solid var(--auth-glass-border)',
                borderRadius: 14,
                boxShadow: errors.password ? '0 0 0 4px var(--auth-danger-ring)' : 'none',
                transition: 'all .15s ease',
              }}
            >
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                onKeyPress={handleKeyPress}
                placeholder="Enter your password"
                disabled={isRateLimited}
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontFamily: 'var(--font-ui)',
                  color: formData.password ? 'var(--auth-glass-text)' : 'var(--auth-glass-placeholder)',
                  letterSpacing: '-0.005em',
                  fontWeight: 500,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--auth-glass-icon-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  textIndent: '-9999px',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute' }}>
                  {showPassword ? (
                    <>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M2 2 22 22" />
                      <path d="M6.7 6.7C4 8.5 2 12 2 12s3.5 7 10 7c2 0 3.8-.6 5.3-1.5" />
                      <path d="M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 4" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            {errors.password && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--auth-danger-text)',
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--auth-danger)' }} />
                {errors.password}
              </div>
            )}
          </div>
        </div>

        {/* Sign in button */}
        <div style={{ marginTop: 22 }}>
          <Button
            variant="primary"
            size="lg"
            disabled={loading || !isFormValid || isRateLimited}
            onClick={handleSubmit}
            style={{
              width: '100%',
              opacity: loading || !isFormValid || isRateLimited ? 0.5 : 1,
              cursor: loading || !isFormValid || isRateLimited ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ animation: 'spin 0.6s linear infinite' }}
                >
                  <circle cx="12" cy="12" r="10" opacity="0.3" />
                  <path d="M12 2A10 10 0 0 1 22 12" opacity="1" />
                </svg>
                Signing in...
              </>
            ) : (
              <>
                Sign In
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </Button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 20px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--auth-glass-divider)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--auth-glass-text-faint)', letterSpacing: '0.12em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--auth-glass-divider)' }} />
        </div>

        {/* Browse tournaments button */}
        <Button
          variant="ghost"
          size="lg"
          onClick={() => navigate('/browse')}
          tabIndex={-1}
          style={{
            width: '100%',
            background: 'var(--auth-glass-bg)',
            color: 'var(--auth-glass-text)',
            border: '1px solid var(--auth-glass-border-strong)',
          }}
        >
          Browse tournaments
        </Button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom link */}
        <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--auth-glass-text-muted)', fontWeight: 500 }}>
          New to U At Court?{' '}
          <button
            onClick={() => navigate('/signup')}
            tabIndex={-1}
            style={{
              color: 'var(--court-300)',
              fontWeight: 700,
              textDecoration: 'underline',
              textDecorationColor: 'var(--auth-info-underline)',
              textUnderlineOffset: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Create an account
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        /* Allow disabled buttons to receive focus for accessibility testing */
        button:disabled {
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
