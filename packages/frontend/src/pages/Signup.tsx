import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { signup } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (token) {
      try {
        const decoded = atob(token);
        const email = decoded.split(':')[0];
        setFormData(prev => ({ ...prev, email }));
      } catch {
        setGeneralError('This link has expired or is invalid');
      }
    }
    emailInputRef.current?.focus();
  }, [token]);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateField = (field: string, currentFormData?: typeof formData) => {
    const data = currentFormData || formData;
    const newErrors = { ...errors };

    switch (field) {
      case 'email':
        if (!data.email) {
          newErrors.email = 'Email is required';
        } else if (!validateEmail(data.email)) {
          newErrors.email = 'Please enter a valid email';
        } else {
          delete newErrors.email;
        }
        break;
      case 'name':
        if (!data.name) {
          newErrors.name = 'Name is required';
        } else if (data.name.length < 2) {
          newErrors.name = 'Name must be at least 2 characters';
        } else {
          delete newErrors.name;
        }
        break;
      case 'password':
        if (!data.password) {
          newErrors.password = 'Password is required';
        } else if (data.password.length < 6) {
          newErrors.password = 'Password must be at least 6 characters';
        } else {
          delete newErrors.password;
        }
        // Also validate confirmPassword if it exists
        if (data.confirmPassword && data.confirmPassword !== data.password) {
          newErrors.confirmPassword = "Passwords don't match";
        } else if (data.confirmPassword === data.password) {
          delete newErrors.confirmPassword;
        }
        break;
      case 'confirmPassword':
        if (!data.confirmPassword) {
          newErrors.confirmPassword = 'Please confirm your password';
        } else if (data.confirmPassword !== data.password) {
          newErrors.confirmPassword = "Passwords don't match";
        } else {
          delete newErrors.confirmPassword;
        }
        break;
    }

    setErrors(newErrors);
  };

  const handleBlur = (field: string) => {
    validateField(field);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFormData = { ...formData, password: e.target.value };
    setFormData(newFormData);
    validateField('password', newFormData);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFormData = { ...formData, confirmPassword: e.target.value };
    setFormData(newFormData);
    validateField('confirmPassword', newFormData);
  };

  const isFormValid = () => {
    return (
      formData.email &&
      formData.name &&
      formData.password &&
      formData.confirmPassword &&
      validateEmail(formData.email) &&
      formData.name.length >= 2 &&
      formData.password.length >= 6 &&
      formData.confirmPassword === formData.password &&
      Object.keys(errors).length === 0
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid()) {
      return;
    }

    setLoading(true);
    setGeneralError('');

    try {
      await signup(formData.email, formData.name, formData.password, token || undefined);
      navigate('/browse');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';

      if (message.includes('Email already in use') || message.includes('DUPLICATE_EMAIL')) {
        setErrors({ email: 'Email already in use' });
      } else if (message.includes('expired') || message.includes('invalid')) {
        setGeneralError('This link has expired or is invalid');
      } else {
        setGeneralError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: 'linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        margin: '0 auto',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Status Bar Simulation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '8px',
          paddingBottom: '16px',
          fontSize: '12px',
          color: '#FFFFFF',
        }}
      >
        <span>9:41</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span>📶</span>
          <span>🔋</span>
        </div>
      </div>

      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        tabIndex={-1}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          marginLeft: '-8px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Logo */}
      <div
        style={{
          width: '40px',
          height: '40px',
          background: '#FFFFFF',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '32px',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#1F2D4E',
        }}
      >
        ◆
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#FFFFFF',
          marginBottom: '8px',
          margin: '0 0 8px 0',
        }}
      >
        Create account
      </h1>

      <p
        style={{
          fontSize: '14px',
          color: '#B0B8C8',
          marginBottom: '32px',
          margin: '0 0 32px 0',
        }}
      >
        Join the tournament
      </p>

      {/* General Error */}
      {generalError && (
        <div
          style={{
            background: '#FF4444',
            color: '#FFFFFF',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {generalError}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ flex: 1 }}>
        {/* Email Field */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#B0B8C8',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}
          >
            Email
          </label>
          <input
            ref={emailInputRef}
            type="email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            onBlur={() => handleBlur('email')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: `1px solid ${errors.email ? '#FF4444' : '#2A3B5D'}`,
              borderRadius: '8px',
              background: '#1A2A42',
              color: '#FFFFFF',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {errors.email && (
            <span role="alert" style={{ fontSize: '12px', color: '#FF4444', marginTop: '4px', display: 'block' }}>
              {errors.email}
            </span>
          )}
        </div>

        {/* Name Field */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#B0B8C8',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}
          >
            Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            onBlur={() => handleBlur('name')}
            disabled={loading}
            placeholder="Your full name"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: `1px solid ${errors.name ? '#FF4444' : '#2A3B5D'}`,
              borderRadius: '8px',
              background: '#1A2A42',
              color: '#FFFFFF',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {errors.name && (
            <span style={{ fontSize: '12px', color: '#FF4444', marginTop: '4px', display: 'block' }}>
              {errors.name}
            </span>
          )}
        </div>

        {/* Password Field */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <label
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#B0B8C8',
                textTransform: 'uppercase',
              }}
            >
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#B0B8C8',
                fontSize: '12px',
                padding: '0',
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={handlePasswordChange}
            onBlur={() => handleBlur('password')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: `1px solid ${errors.password ? '#FF4444' : '#2A3B5D'}`,
              borderRadius: '8px',
              background: '#1A2A42',
              color: '#FFFFFF',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {errors.password && (
            <span style={{ fontSize: '12px', color: '#FF4444', marginTop: '4px', display: 'block' }}>
              {errors.password}
            </span>
          )}
        </div>

        {/* Confirm Password Field */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <label
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#B0B8C8',
                textTransform: 'uppercase',
              }}
            >
              Confirm Password
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {formData.confirmPassword &&
                formData.password &&
                formData.confirmPassword === formData.password && (
                  <span style={{ color: '#4CAF50', fontSize: '14px' }}>✓</span>
                )}
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#B0B8C8',
                  fontSize: '12px',
                  padding: '0',
                }}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            value={formData.confirmPassword}
            onChange={handleConfirmPasswordChange}
            onBlur={() => handleBlur('confirmPassword')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: `1px solid ${errors.confirmPassword ? '#FF4444' : '#2A3B5D'}`,
              borderRadius: '8px',
              background: '#1A2A42',
              color: '#FFFFFF',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {errors.confirmPassword && (
            <span role="alert" style={{ fontSize: '12px', color: '#FF4444', marginTop: '4px', display: 'block' }}>
              {errors.confirmPassword}
            </span>
          )}
        </div>

        {/* Create Account Button */}
        <button
          type="submit"
          disabled={!isFormValid() || loading}
          style={{
            width: '100%',
            padding: '12px',
            background: isFormValid() && !loading ? '#6366F1' : '#3A4B6B',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: isFormValid() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            minHeight: '48px',
            marginBottom: '16px',
          }}
        >
          {loading && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="0" />
            </svg>
          )}
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </form>

      {/* Sign In Link */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ color: '#B0B8C8', fontSize: '14px' }}>
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            tabIndex={-1}
            style={{
              background: 'none',
              border: 'none',
              color: '#6366F1',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              textDecoration: 'underline',
            }}
          >
            Sign in
          </button>
        </span>
      </div>
    </div>
  );
}
