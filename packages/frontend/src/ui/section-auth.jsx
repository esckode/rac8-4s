// =====================================================
// Mobile app authentication screens
// Matches the dark landing aesthetic from section-mobile.jsx
// 390 × 844 (iPhone reference)
// =====================================================

const AUTH_PHONE_W = 390;
const AUTH_PHONE_H = 844;

const AUTH_BG = 'linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)';

/* ============== shared shell ============== */
const AuthShell = ({ children, blob = 'a' }) => {
  // small variant in the decorative bg so the screens feel like a family
  // but each one has its own character
  const blobs = {
    a: <><circle cx="320" cy="120" r="180" fill="#7BC3FF" opacity="0.5" /><circle cx="60" cy="500" r="200" fill="#A98AE0" opacity="0.4" /></>,
    b: <><circle cx="80" cy="160" r="170" fill="#A98AE0" opacity="0.4" /><circle cx="340" cy="560" r="190" fill="#7BC3FF" opacity="0.45" /></>,
    c: <><circle cx="50" cy="80" r="150" fill="#7BC3FF" opacity="0.45" /><circle cx="360" cy="640" r="220" fill="#A98AE0" opacity="0.4" /></>,
    d: <><circle cx="280" cy="200" r="160" fill="#A98AE0" opacity="0.45" /><circle cx="100" cy="620" r="180" fill="#7BC3FF" opacity="0.4" /></>,
    e: <><circle cx="195" cy="80"  r="160" fill="#7BC3FF" opacity="0.4" /><circle cx="80" cy="640" r="170" fill="#A98AE0" opacity="0.35" /></>,
    f: <><circle cx="320" cy="120" r="180" fill="#6BCF96" opacity="0.4" /><circle cx="60" cy="540" r="200" fill="#7BC3FF" opacity="0.4" /></>,
  };
  return (
    <div style={{
      width: AUTH_PHONE_W, height: AUTH_PHONE_H,
      background: AUTH_BG, fontFamily: 'var(--font-ui)', color: '#FFFFFF',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none', filter: 'blur(0.5px)' }}>
        <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">{blobs[blob]}</svg>
      </div>
      {/* Status bar */}
      <div style={{
        height: 44, padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, position: 'relative', zIndex: 1,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>9:41</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="10" viewBox="0 0 16 10"><path d="M0 8h2v2H0zM4 6h2v4H4zM8 3h2v7H8zM12 0h2v10h-2z" fill="#FFFFFF"/></svg>
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 4a8 8 0 0 1 12 0M3 6a5 5 0 0 1 8 0M5 8a2 2 0 0 1 4 0" stroke="#FFFFFF" strokeWidth="1.3" strokeLinecap="round"/></svg>
          <svg width="22" height="10" viewBox="0 0 22 10"><rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke="#FFFFFF" strokeOpacity=".5"/><rect x="2" y="2" width="14" height="6" rx="1" fill="#FFFFFF"/></svg>
        </div>
      </div>
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
};

/* ============== header w/ back + logo mark ============== */
const AuthHeader = ({ onBack = true, compact = false }) => (
  <div style={{
    padding: compact ? '8px 24px 0' : '12px 24px 0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }}>
    {onBack ? (
      <button style={{
        width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(12px)',
      }}>
        <Icon name="arrowLeft" size={18} color="#FFFFFF" />
      </button>
    ) : <div style={{ width: 40 }} />}
    <LogoMark size={28} color="#A8D5FF" accent="#7BC3FF" />
    <div style={{ width: 40 }} />
  </div>
);

/* ============== dark-mode form atoms ============== */
const AuthLabel = ({ children, hint }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)',
    letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8,
  }}>
    <span>{children}</span>
    {hint && <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
  </div>
);

const AuthInput = ({
  value, placeholder, type = 'text', leadingIcon, trailing,
  state = 'default', // 'default' | 'focus' | 'error' | 'success' | 'filled'
  mono = false,
}) => {
  const stateBorder = {
    default: '1px solid rgba(255,255,255,0.14)',
    focus:   '1.5px solid #A8D5FF',
    error:   '1.5px solid #FF8FA8',
    success: '1.5px solid #7BD9A4',
    filled:  '1px solid rgba(255,255,255,0.22)',
  }[state];
  const stateBg = state === 'focus'
    ? 'rgba(168,213,255,0.08)'
    : 'rgba(255,255,255,0.06)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      height: 52, padding: '0 14px',
      background: stateBg, border: stateBorder,
      borderRadius: 14,
      boxShadow: state === 'focus' ? '0 0 0 4px rgba(168,213,255,0.12)' : 'none',
      transition: 'all .15s ease',
    }}>
      {leadingIcon && <Icon name={leadingIcon} size={18} color="rgba(255,255,255,0.55)" />}
      <div style={{
        flex: 1, fontSize: 15, fontFamily: mono ? 'var(--font-num, ui-monospace, monospace)' : 'var(--font-ui)',
        color: value ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
        letterSpacing: mono ? '0.18em' : '-0.005em',
        fontWeight: value && mono ? 600 : 500,
        fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
      }}>
        {type === 'password' && value ? '•'.repeat(value.length) : (value || placeholder)}
      </div>
      {trailing}
    </div>
  );
};

const AuthMessage = ({ tone = 'error', icon = 'info', children }) => {
  const cfg = {
    error:   { bg: 'rgba(255,143,168,0.10)', bd: 'rgba(255,143,168,0.32)', fg: '#FFBFCE', ic: '#FF8FA8' },
    info:    { bg: 'rgba(168,213,255,0.10)', bd: 'rgba(168,213,255,0.32)', fg: '#CFE5FF', ic: '#A8D5FF' },
    success: { bg: 'rgba(123,217,164,0.10)', bd: 'rgba(123,217,164,0.32)', fg: '#C4EFD5', ic: '#7BD9A4' },
  }[tone];
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '12px 14px', background: cfg.bg,
      border: `1px solid ${cfg.bd}`, borderRadius: 12,
      fontSize: 13, lineHeight: 1.45, color: cfg.fg,
    }}>
      <Icon name={icon} size={16} color={cfg.ic} />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
};

const AuthFieldError = ({ children }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 8, fontSize: 12, fontWeight: 600, color: '#FFBFCE',
  }}>
    <span style={{ width: 4, height: 4, borderRadius: 2, background: '#FF8FA8' }} />
    {children}
  </div>
);

const AuthFieldSuccess = ({ children }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: 8, fontSize: 12, fontWeight: 600, color: '#C4EFD5',
  }}>
    <Icon name="check" size={12} color="#7BD9A4" strokeWidth={3} />
    {children}
  </div>
);

// "Eye" toggle for password fields (icon-only, lives inside the input trailing slot)
const PasswordEye = ({ shown }) => (
  <button style={{
    width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
    background: 'transparent', color: 'rgba(255,255,255,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {shown ? (
        <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>
      ) : (
        <><path d="M2 2 22 22"/><path d="M6.7 6.7C4 8.5 2 12 2 12s3.5 7 10 7c2 0 3.8-.6 5.3-1.5"/><path d="M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 4"/></>
      )}
    </svg>
  </button>
);

const AuthBottomLink = ({ prefix, link }) => (
  <div style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
    {prefix} <span style={{ color: '#A8D5FF', fontWeight: 700, textDecoration: 'underline', textDecorationColor: 'rgba(168,213,255,0.4)', textUnderlineOffset: 3 }}>{link}</span>
  </div>
);

/* ============== 01 · LOGIN ============== */
const AuthLogin = () => (
  <AuthShell blob="a">
    <AuthHeader />
    <div style={{ flex: 1, padding: '24px 28px 32px', display: 'flex', flexDirection: 'column' }}>
      <div className="uac-display" style={{
        fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#FFFFFF',
      }}>Welcome back.</div>
      <div style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
        Sign in to see your matches, standings, and tonight's tournaments.
      </div>

      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <AuthLabel>Email</AuthLabel>
          <AuthInput leadingIcon="user" value="aanya.patel@gmail.com" state="filled" />
        </div>
        <div>
          <AuthLabel hint={<span style={{ color: '#A8D5FF', fontWeight: 700 }}>Forgot?</span>}>Password</AuthLabel>
          <AuthInput type="password" value="seekret123" state="filled" trailing={<PasswordEye />} />
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <Button variant="primary" size="lg" fullWidth iconRight={<Icon name="arrow" size={16} />}>
          Sign in
        </Button>
      </div>

      {/* divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 20px' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em' }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      </div>

      <Button variant="ghost" size="lg" fullWidth
        style={{ background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.16)' }}>
        Browse tournaments
      </Button>

      <div style={{ flex: 1 }} />
      <AuthBottomLink prefix="New to U At Court?" link="Create an account" />
    </div>
  </AuthShell>
);

/* ============== 02 · SIGNUP ============== */
const AuthSignup = () => (
  <AuthShell blob="b">
    <AuthHeader />
    <div style={{ flex: 1, padding: '24px 28px 28px', display: 'flex', flexDirection: 'column' }}>
      <div className="uac-display" style={{
        fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#FFFFFF',
      }}>Create<br/>your account.</div>
      <div style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
        One login for every court, club, and tournament.
      </div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <AuthLabel>Email</AuthLabel>
          <AuthInput leadingIcon="user" value="aanya.patel@gmail.com" state="filled" />
        </div>
        <div>
          <AuthLabel>Full name</AuthLabel>
          <AuthInput value="Aanya Patel" state="filled" />
        </div>
        <div>
          <AuthLabel hint="min 6 characters">Password</AuthLabel>
          <AuthInput type="password" value="shuttlecock" state="filled" trailing={<PasswordEye />} />
        </div>
        <div>
          <AuthLabel>Confirm password</AuthLabel>
          <AuthInput type="password" value="shuttlecock" state="success" trailing={<PasswordEye />} />
          <AuthFieldSuccess>Passwords match</AuthFieldSuccess>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <Button variant="primary" size="lg" fullWidth iconRight={<Icon name="arrow" size={16} />}>
          Create account
        </Button>
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.5 }}>
        By continuing you agree to our <span style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>Terms</span> &amp; <span style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}>Privacy</span>.
      </div>

      <div style={{ flex: 1 }} />
      <AuthBottomLink prefix="Already on the court?" link="Sign in" />
    </div>
  </AuthShell>
);

/* ============== 03 · FORGOT PASSWORD ============== */
const AuthForgotPassword = () => (
  <AuthShell blob="c">
    <AuthHeader />
    <div style={{ flex: 1, padding: '24px 28px 32px', display: 'flex', flexDirection: 'column' }}>
      <div className="uac-display" style={{
        fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#FFFFFF',
      }}>Forgot your<br/>password?</div>
      <div style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
        Enter your email and we'll send you a 6-digit reset code. It expires in 15 minutes.
      </div>

      <div style={{ marginTop: 28 }}>
        <AuthLabel>Email</AuthLabel>
        <AuthInput leadingIcon="user" value="aanya.patel@gmail.com" state="focus" />
      </div>

      <div style={{ marginTop: 22 }}>
        <Button variant="primary" size="lg" fullWidth iconRight={<Icon name="arrow" size={16} />}>
          Send reset code
        </Button>
      </div>

      <div style={{ marginTop: 16 }}>
        <AuthMessage tone="info" icon="info">
          We'll send a code even if the email isn't on file — that's intentional, to keep accounts private.
        </AuthMessage>
      </div>

      <div style={{ flex: 1 }} />
      <AuthBottomLink prefix="Remember it?" link="Back to sign in" />
    </div>
  </AuthShell>
);

/* ============== 04 · FORGOT PASSWORD · SENT ============== */
const AuthForgotPasswordSent = () => (
  <AuthShell blob="f">
    <AuthHeader />
    <div style={{ flex: 1, padding: '32px 28px 32px', display: 'flex', flexDirection: 'column' }}>
      {/* Confirmation glyph */}
      <div style={{
        width: 88, height: 88, borderRadius: 28,
        background: 'linear-gradient(135deg, rgba(123,217,164,0.32) 0%, rgba(123,217,164,0.10) 100%)',
        border: '1px solid rgba(123,217,164,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 12px 40px rgba(123,217,164,0.22)',
        marginBottom: 26,
      }}>
        <Icon name="check" size={44} color="#7BD9A4" strokeWidth={2.5} />
      </div>

      <div className="uac-display" style={{
        fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#FFFFFF',
      }}>Reset code sent.</div>
      <div style={{ marginTop: 12, fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
        We sent a 6-digit code to
      </div>
      <div style={{
        marginTop: 12, padding: '12px 16px', borderRadius: 12,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
        display: 'inline-flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start',
      }}>
        <Icon name="chat" size={16} color="#A8D5FF" />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>aanya.patel@gmail.com</span>
      </div>

      <div style={{ marginTop: 22, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
        Didn't receive it? Check your spam folder, or wait <span style={{ color: '#A8D5FF', fontWeight: 700 }}>0:24</span> before resending.
      </div>

      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button variant="primary" size="lg" fullWidth iconRight={<Icon name="arrow" size={16} />}>
          Enter code
        </Button>
        <Button variant="ghost" size="lg" fullWidth disabled
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.10)' }}>
          Resend code (0:24)
        </Button>
      </div>

      <div style={{ flex: 1 }} />
      <AuthBottomLink prefix="Wrong email?" link="Change it" />
    </div>
  </AuthShell>
);

/* ============== 05 · RESET PASSWORD ============== */
const AuthResetPassword = () => (
  <AuthShell blob="d">
    <AuthHeader />
    <div style={{ flex: 1, padding: '20px 28px 24px', display: 'flex', flexDirection: 'column' }}>
      <div className="uac-display" style={{
        fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#FFFFFF',
      }}>Set a new<br/>password.</div>
      <div style={{ marginTop: 8, fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
        Enter the 6-digit code we sent, then pick something fresh.
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <AuthLabel>Email</AuthLabel>
          <AuthInput leadingIcon="user" value="aanya.patel@gmail.com" state="filled" />
        </div>
        <div>
          <AuthLabel hint="6 digits · 14:32 left">Reset code</AuthLabel>
          <AuthInput value="42 18 07" state="focus" mono />
          <AuthFieldError>Code didn't match. 2 attempts remaining.</AuthFieldError>
        </div>
        <div>
          <AuthLabel hint="min 6 characters">New password</AuthLabel>
          <AuthInput type="password" value="newshuttle22" state="filled" trailing={<PasswordEye />} />
        </div>
        <div>
          <AuthLabel>Confirm new password</AuthLabel>
          <AuthInput type="password" value="newshuttle22" state="success" trailing={<PasswordEye />} />
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="primary" size="lg" fullWidth iconRight={<Icon name="arrow" size={16} />}>
          Update password
        </Button>
        <Button variant="ghost" size="md" fullWidth
          style={{ background: 'transparent', color: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.12)' }}>
          Request a new code
        </Button>
      </div>

      <div style={{ flex: 1 }} />
      <AuthBottomLink prefix="" link="Back to sign in" />
    </div>
  </AuthShell>
);

/* ============== 06 · LOGIN · ERROR STATE ============== */
const AuthLoginError = () => (
  <AuthShell blob="e">
    <AuthHeader />
    <div style={{ flex: 1, padding: '24px 28px 32px', display: 'flex', flexDirection: 'column' }}>
      <div className="uac-display" style={{
        fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, color: '#FFFFFF',
      }}>Welcome back.</div>
      <div style={{ marginTop: 10, fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
        Sign in to see your matches, standings, and tonight's tournaments.
      </div>

      <div style={{ marginTop: 22 }}>
        <AuthMessage tone="error" icon="info">
          <strong style={{ color: '#FFFFFF' }}>Invalid email or password.</strong> Double-check, or reset your password.
        </AuthMessage>
      </div>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <AuthLabel>Email</AuthLabel>
          <AuthInput leadingIcon="user" value="aanya.patel@gmail.com" state="filled" />
        </div>
        <div>
          <AuthLabel hint={<span style={{ color: '#A8D5FF', fontWeight: 700 }}>Forgot?</span>}>Password</AuthLabel>
          <AuthInput type="password" value="wrongpass" state="error" trailing={<PasswordEye />} />
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <Button variant="primary" size="lg" fullWidth iconRight={<Icon name="arrow" size={16} />}>
          Try again
        </Button>
      </div>

      <div style={{ flex: 1 }} />
      <AuthBottomLink prefix="New to U At Court?" link="Create an account" />
    </div>
  </AuthShell>
);

Object.assign(window, {
  AuthShell, AuthHeader, AuthInput, AuthLabel, AuthMessage, PasswordEye,
  AuthLogin, AuthSignup, AuthForgotPassword, AuthForgotPasswordSent,
  AuthResetPassword, AuthLoginError,
});
