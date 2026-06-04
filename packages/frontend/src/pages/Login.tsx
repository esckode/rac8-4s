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

export const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Focus email field on mount
    emailInputRef.current?.focus()
  }, [])

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
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setApiError(errorMessage)
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e as any)
    }
  }

  const isFormValid = formData.email && formData.password && !errors.email && !errors.password

  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: 'linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)',
        fontFamily: 'var(--font-ui)',
        color: '#FFFFFF',
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
          <circle cx="320" cy="120" r="180" fill="#7BC3FF" opacity="0.5" />
          <circle cx="60" cy="500" r="200" fill="#A98AE0" opacity="0.4" />
        </svg>
      </div>

      {/* Status bar */}
      <div
        style={{
          height: 44,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>9:41</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="10" viewBox="0 0 16 10">
            <path d="M0 8h2v2H0zM4 6h2v4H4zM8 3h2v7H8zM12 0h2v10h-2z" fill="#FFFFFF" />
          </svg>
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 4a8 8 0 0 1 12 0M3 6a5 5 0 0 1 8 0M5 8a2 2 0 0 1 4 0" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <svg width="22" height="10" viewBox="0 0 22 10">
            <rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke="#FFFFFF" strokeOpacity=".5" />
            <rect x="2" y="2" width="14" height="6" rx="1" fill="#FFFFFF" />
          </svg>
        </div>
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
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.08)',
            color: '#FFFFFF',
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
        <LogoMark size={28} color="#A8D5FF" accent="#7BC3FF" />
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
            color: '#FFFFFF',
            marginBottom: 10,
          }}
        >
          Welcome back.
        </div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          Sign in to see your matches, standings, and tonight's tournaments.
        </div>

        {/* Error message */}
        {apiError && (
          <div
            style={{
              marginTop: 22,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              background: 'rgba(255,143,168,0.10)',
              border: '1px solid rgba(255,143,168,0.32)',
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.45,
              color: '#FFBFCE',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#FF8FA8" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10" />
              <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">!</text>
            </svg>
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#FFFFFF' }}>Invalid email or password.</strong> Double-check, or reset your password.
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
                color: 'rgba(255,255,255,0.75)',
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
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 52,
                padding: '0 14px',
                background: errors.email ? 'rgba(255,143,168,0.08)' : 'rgba(255,255,255,0.06)',
                border: errors.email ? '1.5px solid #FF8FA8' : '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14,
                boxShadow: errors.email ? '0 0 0 4px rgba(255,143,168,0.12)' : 'none',
                fontSize: 15,
                fontFamily: 'var(--font-ui)',
                color: formData.email ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                letterSpacing: '-0.005em',
                fontWeight: formData.email ? 500 : 500,
                transition: 'all .15s ease',
                boxSizing: 'border-box',
              }}
            />
            {errors.email && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#FFBFCE',
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: 2, background: '#FF8FA8' }} />
                {errors.email}
              </div>
            )}
          </div>

          {/* Password field */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                fontSize: 12,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.75)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              <span>Password</span>
              <button
                onClick={() => navigate('/forgot-password')}
                style={{
                  fontWeight: 700,
                  color: '#A8D5FF',
                  textTransform: 'none',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                Forgot?
              </button>
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 52,
                padding: '0 14px',
                background: errors.password ? 'rgba(255,143,168,0.08)' : 'rgba(255,255,255,0.06)',
                border: errors.password ? '1.5px solid #FF8FA8' : '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14,
                boxShadow: errors.password ? '0 0 0 4px rgba(255,143,168,0.12)' : 'none',
                transition: 'all .15s ease',
              }}
            >
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                onKeyPress={handleKeyPress}
                placeholder="Enter your password"
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontFamily: 'var(--font-ui)',
                  color: formData.password ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                  letterSpacing: '-0.005em',
                  fontWeight: 500,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                }}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#FFBFCE',
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: 2, background: '#FF8FA8' }} />
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
            disabled={loading || !isFormValid}
            onClick={handleSubmit}
            style={{
              width: '100%',
              opacity: loading || !isFormValid ? 0.5 : 1,
              cursor: loading || !isFormValid ? 'not-allowed' : 'pointer',
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
                Sign in
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </Button>
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 20px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Browse tournaments button */}
        <Button
          variant="ghost"
          size="lg"
          onClick={() => navigate('/browse')}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.06)',
            color: '#FFFFFF',
            border: '1px solid rgba(255,255,255,0.16)',
          }}
        >
          Browse tournaments
        </Button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom link */}
        <div style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
          New to U At Court?{' '}
          <button
            onClick={() => navigate('/signup')}
            style={{
              color: '#A8D5FF',
              fontWeight: 700,
              textDecoration: 'underline',
              textDecorationColor: 'rgba(168,213,255,0.4)',
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
      `}</style>
    </div>
  )
}
