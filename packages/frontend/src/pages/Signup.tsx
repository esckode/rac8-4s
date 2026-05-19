import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

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

  const handleBlur = (field: string) => {
    const newErrors = { ...errors };

    switch (field) {
      case 'email':
        if (!formData.email) {
          newErrors.email = 'Email is required';
        } else if (!validateEmail(formData.email)) {
          newErrors.email = 'Please enter a valid email';
        } else {
          delete newErrors.email;
        }
        break;
      case 'name':
        if (!formData.name) {
          newErrors.name = 'Name is required';
        } else if (formData.name.length < 2) {
          newErrors.name = 'Name must be at least 2 characters';
        } else {
          delete newErrors.name;
        }
        break;
      case 'password':
        if (!formData.password) {
          newErrors.password = 'Password is required';
        } else if (formData.password.length < 6) {
          newErrors.password = 'Password must be at least 6 characters';
        } else {
          delete newErrors.password;
        }
        break;
      case 'confirmPassword':
        if (!formData.confirmPassword) {
          newErrors.confirmPassword = 'Please confirm your password';
        } else if (formData.confirmPassword !== formData.password) {
          newErrors.confirmPassword = "Passwords don't match";
        } else {
          delete newErrors.confirmPassword;
        }
        break;
    }

    setErrors(newErrors);
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
      const response = await fetch('http://localhost:5173/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name,
          password: formData.password,
          token: token || undefined,
        }),
      });

      if (response.ok) {
        navigate('/browse');
      } else if (response.status === 409) {
        setErrors({ email: 'Email already in use' });
      } else if (response.status === 401) {
        setGeneralError('This link has expired or is invalid');
      } else if (response.status === 400) {
        const data = await response.json();
        setErrors({ password: data.message || 'Invalid input' });
      } else {
        setGeneralError('Something went wrong. Please try again.');
      }
    } catch (error) {
      setGeneralError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
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
            <span style={{ fontSize: '12px', color: '#FF4444', marginTop: '4px', display: 'block' }}>
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
              disabled={loading}
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
            onChange={e => setFormData({ ...formData, password: e.target.value })}
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
                disabled={loading}
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
            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
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
            <span style={{ fontSize: '12px', color: '#FF4444', marginTop: '4px', display: 'block' }}>
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
