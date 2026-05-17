import React from 'react'
import '../styles/globals.css'

// Minimal component stubs to render the spec
const Icon = ({ name, size = 18, color, strokeWidth }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth={strokeWidth || 2}>
    <circle cx="12" cy="12" r="10" />
  </svg>
)

const Logo = ({ size = 20, tone = 'light' }: any) => (
  <svg width={size * 3.5} height={size} viewBox="0 0 70 20" fill="none">
    <text x="18" y="15" fontSize={size * 0.8} fontWeight="700" fill={tone === 'light' ? '#FFF' : '#000'}>Court</text>
  </svg>
)

const LogoMark = ({ size = 88, color = '#A8D5FF', accent = '#7BC3FF' }: any) => (
  <svg width={size} height={size} viewBox="0 0 88 88" fill="none">
    <circle cx="44" cy="44" r="40" fill={color} opacity="0.8" />
    <circle cx="44" cy="44" r="32" fill={accent} />
    <path d="M 44 20 L 44 68 M 20 44 L 68 44" stroke="white" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

const Button = ({ variant = 'primary', size = 'lg', fullWidth, children, style }: any) => {
  const baseStyle: React.CSSProperties = {
    padding: size === 'lg' ? '16px 24px' : '12px 16px',
    borderRadius: '12px',
    border: 'none',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    width: fullWidth ? '100%' : 'auto',
    ...style,
  }

  if (variant === 'primary') {
    return <button style={{ ...baseStyle, background: '#5B8DEE', color: 'white' }}>{children}</button>
  }
  return <button style={{ ...baseStyle, background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.18)' }}>{children}</button>
}

// Design spec component from section-mobile.jsx
const MobileLanding = () => (
  <div style={{
    width: 390, height: 844,
    background: 'linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)', fontFamily: 'var(--font-ui)', color: 'var(--ink-900)',
    position: 'relative', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  }}>
    {/* Status bar */}
    <div style={{
      height: 44, padding: '0 24px', background: 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="16" height="10" viewBox="0 0 16 10"><path d="M0 8h2v2H0zM4 6h2v4H4zM8 3h2v7H8zM12 0h2v10h-2z" fill="white"/></svg>
      </div>
    </div>

    {/* Decorative circles */}
    <div style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
        <circle cx="320" cy="120" r="180" fill="#7BC3FF" opacity="0.5" />
        <circle cx="60" cy="500" r="200" fill="#A98AE0" opacity="0.4" />
      </svg>
    </div>

    {/* Content */}
    <div style={{ position: 'relative', flex: 1, padding: '0 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ paddingTop: 32 }}>
        <Logo size={20} tone="light" />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <LogoMark size={88} color="#A8D5FF" accent="#7BC3FF" />
        </div>
        <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', color: '#FFFFFF', lineHeight: 1.05, marginBottom: 16 }}>
          See you at the court.
        </div>
        <div style={{ marginTop: 16, fontSize: 16, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, maxWidth: 320 }}>
          Find drop-in nights, join your club's leagues, and run friendly tournaments — all on the sideline.
        </div>
      </div>

      <div style={{ paddingBottom: 36, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button variant="primary" size="lg" fullWidth>Continue with email</Button>
        <Button variant="ghost" size="lg" fullWidth style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.18)' }}>
          Browse tournaments
        </Button>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
          New here? An account creates itself when you join your first night.
        </div>
      </div>
    </div>
  </div>
);

export const DesignSpec: React.FC = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5', padding: 20 }}>
      <MobileLanding />
    </div>
  )
}
