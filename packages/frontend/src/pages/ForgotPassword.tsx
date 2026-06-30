import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/shared/Button'
import { LogoMark } from '../components/shared/LogoMark'

interface FormErrors {
  email?: string
}

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({ email: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [successEmail, setSuccessEmail] = useState('')
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
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email,
        }),
      })

      if (!response.ok) {
        if (response.status === 400) {
          setErrors(prev => ({ ...prev, email: 'Please enter a valid email' }))
        } else {
          setApiError('Something went wrong. Please try again.')
        }
        setLoading(false)
        return
      }

      // Success - show confirmation
      setSuccessEmail(formData.email)
      setFormData({ email: '' })
    } catch (err) {
      setApiError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e as any)
    }
  }

  const isFormValid = formData.email && !errors.email

  // Success state
  if (successEmail) {
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
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--auth-glass-text)' }}>9:41</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="16" height="10" viewBox="0 0 16 10">
              <path d="M0 8h2v2H0zM4 6h2v4H4zM8 3h2v7H8zM12 0h2v10h-2z" fill="var(--auth-glass-text)" />
            </svg>
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
              <path d="M1 4a8 8 0 0 1 12 0M3 6a5 5 0 0 1 8 0M5 8a2 2 0 0 1 4 0" stroke="var(--auth-glass-text)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <svg width="22" height="10" viewBox="0 0 22 10">
              <rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke="var(--auth-glass-text)" strokeOpacity=".5" />
              <rect x="2" y="2" width="14" height="6" rx="1" fill="var(--auth-glass-text)" />
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
            onClick={() => {
              setSuccessEmail('')
              setFormData({ email: '' })
            }}
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

        {/* Success content */}
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
            ✓ Code sent.
          </div>
          <div style={{ fontSize: 15, color: 'var(--auth-glass-text-muted)', lineHeight: 1.5 }}>
            We've sent a 6-digit code to your email address.
          </div>

          {/* Success message box */}
          <div
            style={{
              marginTop: 22,
              padding: '14px',
              background: 'var(--auth-info-wash)',
              border: '1px solid var(--auth-info-border)',
              borderRadius: 12,
              fontSize: 14,
              lineHeight: 1.5,
              color: 'var(--court-300)',
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <strong style={{ color: 'var(--auth-glass-text)' }}>Email:</strong>
            </div>
            <div>{successEmail}</div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Enter code button */}
          <div style={{ marginBottom: 12 }}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/reset-password')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              Enter code
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Button>
          </div>

          {/* Change email button */}
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              setSuccessEmail('')
              setFormData({ email: '' })
              emailInputRef.current?.focus()
            }}
            style={{
              width: '100%',
              background: 'var(--auth-glass-bg)',
              color: 'var(--auth-glass-text)',
              border: '1px solid var(--auth-glass-border-strong)',
            }}
          >
            Change email
          </Button>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Form state
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
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--auth-glass-text)' }}>9:41</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="10" viewBox="0 0 16 10">
            <path d="M0 8h2v2H0zM4 6h2v4H4zM8 3h2v7H8zM12 0h2v10h-2z" fill="var(--auth-glass-text)" />
          </svg>
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 4a8 8 0 0 1 12 0M3 6a5 5 0 0 1 8 0M5 8a2 2 0 0 1 4 0" stroke="var(--auth-glass-text)" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <svg width="22" height="10" viewBox="0 0 22 10">
            <rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke="var(--auth-glass-text)" strokeOpacity=".5" />
            <rect x="2" y="2" width="14" height="6" rx="1" fill="var(--auth-glass-text)" />
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
          Reset your password.
        </div>
        <div style={{ fontSize: 15, color: 'var(--auth-glass-text-muted)', lineHeight: 1.5 }}>
          Enter your email address and we'll send you a code to reset your password.
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
              <strong style={{ color: 'var(--auth-glass-text)' }}>Error.</strong> {apiError}
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
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
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
                  color: 'var(--auth-danger-text)',
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--auth-danger)' }} />
                {errors.email}
              </div>
            )}
          </div>
        </div>

        {/* Send reset code button */}
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
                Sending code...
              </>
            ) : (
              <>
                Send reset code
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </Button>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom link */}
        <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--auth-glass-text-muted)', fontWeight: 500 }}>
          Remember your password?{' '}
          <button
            onClick={() => navigate('/login')}
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
            Sign in
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
