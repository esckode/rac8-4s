import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/shared/Button'
import { LogoMark } from '../components/shared/LogoMark'

interface FormErrors {
  email?: string
  code?: string
  password?: string
  confirmPassword?: string
}

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const formatCode = (code: string): string => {
  const digitsOnly = code.replace(/\D/g, '')
  if (digitsOnly.length <= 2) return digitsOnly
  if (digitsOnly.length <= 4) return `${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2)}`
  return `${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2, 4)} ${digitsOnly.slice(4, 6)}`
}

const extractCode = (formatted: string): string => {
  return formatted.replace(/\s/g, '')
}

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    code: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    const codeDigitsOnly = extractCode(formData.code)
    if (!formData.code) {
      newErrors.code = 'Code is required'
    } else if (codeDigitsOnly.length !== 6) {
      newErrors.code = 'Code must be 6 digits'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.confirmPassword !== formData.password) {
      newErrors.confirmPassword = "Passwords don't match"
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

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const digitsOnly = value.replace(/\D/g, '').slice(0, 6)
    const formatted = formatCode(digitsOnly)
    setFormData(prev => ({ ...prev, code: formatted }))

    // Clear code error when user is typing
    if (value) {
      setErrors(prev => {
        const { code, ...rest } = prev
        return rest
      })
    }
  }

  const handleCodeBlur = () => {
    // Code validation happens on submit, not on blur
  }

  const handlePasswordBlur = () => {
    if (formData.password && formData.password.length < 6) {
      setErrors(prev => ({ ...prev, password: 'Password must be at least 6 characters' }))
    } else {
      setErrors(prev => {
        const { password, ...rest } = prev
        return rest
      })
    }
  }

  const handleConfirmPasswordBlur = () => {
    if (formData.confirmPassword) {
      if (formData.confirmPassword !== formData.password) {
        setErrors(prev => ({ ...prev, confirmPassword: "Passwords don't match" }))
      } else {
        setErrors(prev => {
          const { confirmPassword, ...rest } = prev
          return rest
        })
      }
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
      const codeDigitsOnly = extractCode(formData.code)
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email,
          code: codeDigitsOnly,
          newPassword: formData.password,
        }),
      })

      if (!response.ok) {
        if (response.status === 400) {
          const errorData = await response.json()
          if (errorData.field === 'email') {
            setErrors(prev => ({ ...prev, email: 'Please enter a valid email' }))
          } else if (errorData.field === 'code') {
            setErrors(prev => ({ ...prev, code: errorData.message || 'Invalid code' }))
          } else {
            setApiError(errorData.message || 'Invalid request')
          }
        } else if (response.status === 401) {
          const errorData = await response.json()
          if (errorData.message?.includes('expired')) {
            setErrors(prev => ({ ...prev, code: 'Reset code expired' }))
            setApiError('Request a new code to continue')
          } else {
            setErrors(prev => ({ ...prev, code: 'Invalid reset code' }))
            setApiError('Request a new code to continue')
          }
        } else if (response.status === 429) {
          const errorData = await response.json()
          setAttemptsRemaining(errorData.attemptsRemaining)
          setApiError('Too many attempts. Try again later.')
        } else {
          setApiError('Something went wrong. Please try again.')
        }
        setLoading(false)
        return
      }

      setSuccessMessage('Password updated successfully')
      setFormData({ email: '', code: '', password: '', confirmPassword: '' })

      setTimeout(() => {
        navigate('/login')
      }, 2000)
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

  const codeDigitsOnly = extractCode(formData.code)
  const isFormValid =
    formData.email &&
    formData.code &&
    formData.password &&
    formData.confirmPassword &&
    validateEmail(formData.email) &&
    formData.password.length >= 6 &&
    formData.confirmPassword === formData.password &&
    Object.keys(errors).length === 0

  // Success state
  if (successMessage) {
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
            onClick={() => navigate('/login')}
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
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 60,
              marginBottom: 16,
            }}
          >
            ✓
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              color: '#FFFFFF',
              marginBottom: 10,
              textAlign: 'center',
            }}
          >
            Password updated.
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, textAlign: 'center' }}>
            Your password has been successfully reset. Redirecting to login...
          </div>

          {/* Sign in now button (optional, since we auto-redirect) */}
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/login')}
            style={{
              marginTop: 32,
              width: '100%',
              maxWidth: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            Sign in now
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
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
          onClick={() => navigate('/login')}
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
          overflow: 'auto',
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
          Reset your password.
        </div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: 8 }}>
          Enter the code we sent to your email and choose a new password.
        </div>

        {/* Error message */}
        {apiError && (
          <div
            style={{
              marginTop: 16,
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
              <strong style={{ color: '#FFFFFF' }}>Error.</strong> {apiError}
            </div>
          </div>
        )}

        {/* Attempts warning */}
        {attemptsRemaining !== null && attemptsRemaining > 0 && attemptsRemaining <= 2 && (
          <div
            style={{
              marginTop: apiError ? 12 : 16,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              background: 'rgba(255,193,7,0.10)',
              border: '1px solid rgba(255,193,7,0.32)',
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.45,
              color: '#FFC966',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFC107" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div style={{ flex: 1 }}>
              {attemptsRemaining} attempts remaining
            </div>
          </div>
        )}

        {/* Form fields */}
        <div style={{ marginTop: apiError || attemptsRemaining ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              disabled={loading}
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
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'text',
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

          {/* Code field */}
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
              Reset Code
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={handleCodeChange}
              onBlur={handleCodeBlur}
              onKeyPress={handleKeyPress}
              placeholder="Reset code"
              disabled={loading}
              maxLength={8}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 52,
                padding: '0 14px',
                background: errors.code ? 'rgba(255,143,168,0.08)' : 'rgba(255,255,255,0.06)',
                border: errors.code ? '1.5px solid #FF8FA8' : '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14,
                boxShadow: errors.code ? '0 0 0 4px rgba(255,143,168,0.12)' : 'none',
                fontSize: 15,
                fontFamily: 'var(--font-ui)',
                color: formData.code ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                letterSpacing: '-0.005em',
                fontWeight: 500,
                transition: 'all .15s ease',
                boxSizing: 'border-box',
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'text',
              }}
            />
            {errors.code && (
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
                {errors.code}
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
              <span>New Password</span>
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
                onBlur={handlePasswordBlur}
                onKeyPress={handleKeyPress}
                placeholder="Enter a new password"
                disabled={loading}
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
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'text',
                }}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  opacity: loading ? 0.6 : 1,
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

          {/* Confirm Password field */}
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
              <span>Confirm Password</span>
              {formData.password && formData.confirmPassword && formData.confirmPassword === formData.password && !errors.confirmPassword && (
                <span style={{ color: '#7BC3FF', textTransform: 'none', fontWeight: 500 }}>✓ Matches</span>
              )}
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: 52,
                padding: '0 14px',
                background: errors.confirmPassword ? 'rgba(255,143,168,0.08)' : 'rgba(255,255,255,0.06)',
                border: errors.confirmPassword ? '1.5px solid #FF8FA8' : '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14,
                boxShadow: errors.confirmPassword ? '0 0 0 4px rgba(255,143,168,0.12)' : 'none',
                transition: 'all .15s ease',
              }}
            >
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                onBlur={handleConfirmPasswordBlur}
                onKeyPress={handleKeyPress}
                placeholder="Confirm your password"
                disabled={loading}
                style={{
                  flex: 1,
                  fontSize: 15,
                  fontFamily: 'var(--font-ui)',
                  color: formData.confirmPassword ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                  letterSpacing: '-0.005em',
                  fontWeight: 500,
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'text',
                }}
              />
              <button
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={loading}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showConfirmPassword ? (
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
            {errors.confirmPassword && (
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
                {errors.confirmPassword}
              </div>
            )}
          </div>
        </div>

        {/* Update password button */}
        <div style={{ marginTop: 24 }}>
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
                Updating password...
              </>
            ) : (
              <>
                Update password
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
        <div style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
          Didn't receive a code?{' '}
          <button
            onClick={() => navigate('/forgot-password')}
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
            Request a new code
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
