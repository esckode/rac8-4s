// =====================================================
// C U At Court — Shared component library
// Used across every section of the design system.
// =====================================================

/* ---------- LOGO ---------- */
// The mark is two nested crescents (the "C" + "U" stylization).
// Built as SVG so we can color/scale freely on light or dark surfaces.
const LogoMark = ({ size = 56, color = 'var(--court-400)', accent }) => {
  const a = accent || color;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {/* Outer crescent — large C opening to the right */}
      <path
        d="M 50 6
           A 44 44 0 1 0 50 94
           A 32 32 0 1 1 50 18
           Z"
        fill={color}
      />
      {/* Inner crescent — smaller C, slightly offset */}
      <path
        d="M 50 24
           A 26 26 0 1 0 50 76
           A 14 14 0 1 1 50 32
           Z"
        fill={a}
        opacity="0.85"
      />
    </svg>
  );
};

const Logo = ({ size = 28, tone = 'navy', tagline = false }) => {
  // tone: navy (dark on light), light (light on dark), mono-court
  const ink = tone === 'light' ? '#FFFFFF' : 'var(--ink-900)';
  const mark1 = tone === 'light' ? '#A8D5FF' : 'var(--court-400)';
  const mark2 = tone === 'light' ? '#7BC3FF' : 'var(--court-500)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.35 }}>
      <LogoMark size={size * 1.5} color={mark1} accent={mark2} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <div className="uac-display" style={{
          fontWeight: 700, fontSize: size,
          color: ink, letterSpacing: '-0.02em',
        }}>
          U At Court
        </div>
        {tagline && (
          <div style={{
            fontSize: size * 0.42, marginTop: size * 0.18,
            color: tone === 'light' ? 'rgba(255,255,255,0.7)' : 'var(--ink-500)',
            fontWeight: 500, letterSpacing: '0.02em',
          }}>
            Make Your Play Count
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------- BUTTON ---------- */
const Button = ({
  children, variant = 'primary', size = 'md', icon, iconRight,
  fullWidth = false, disabled = false, onClick, style = {},
}) => {
  const sizes = {
    sm: { padding: '8px 14px', fontSize: 13, height: 34, gap: 6, radius: 'var(--r-md)' },
    md: { padding: '11px 18px', fontSize: 14, height: 42, gap: 8, radius: 'var(--r-lg)' },
    lg: { padding: '14px 22px', fontSize: 15, height: 50, gap: 10, radius: 'var(--r-lg)' },
  };
  const s = sizes[size];

  const variants = {
    primary: {
      background: 'var(--court-400)',
      color: 'var(--ink-900)',
      border: '1px solid var(--court-500)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, var(--shadow-sm)',
    },
    primaryBold: {
      background: 'linear-gradient(180deg, var(--court-400) 0%, var(--court-500) 100%)',
      color: '#FFFFFF',
      border: '1px solid var(--court-600)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset, var(--shadow-md)',
    },
    secondary: {
      background: 'var(--lavender-300)',
      color: 'var(--ink-900)',
      border: '1px solid var(--lavender-400)',
      boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, var(--shadow-sm)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--ink-700)',
      border: '1px solid var(--border)',
    },
    soft: {
      background: 'var(--court-100)',
      color: 'var(--court-700)',
      border: '1px solid var(--court-200)',
    },
    dark: {
      background: 'var(--ink-900)',
      color: '#FFFFFF',
      border: '1px solid var(--ink-900)',
    },
    danger: {
      background: 'var(--rose-400)',
      color: '#FFFFFF',
      border: '1px solid var(--rose-600)',
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: s.gap, padding: s.padding, height: s.height,
        borderRadius: s.radius, fontSize: s.fontSize, fontWeight: 600,
        fontFamily: 'var(--font-ui)', cursor: disabled ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : undefined,
        opacity: disabled ? 0.5 : 1,
        letterSpacing: '-0.005em',
        transition: 'transform .12s, box-shadow .12s',
        ...variants[variant], ...style,
      }}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
};

/* ---------- ICON ---------- */
// Tiny Lucide-style icons hand-drawn as SVG so we have no dep.
const Icon = ({ name, size = 18, color = 'currentColor', strokeWidth = 2 }) => {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const paths = {
    home: <><path d="M3 12 12 3l9 9" /><path d="M5 10v10h14V10" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    trophy: <><path d="M8 4h8v6a4 4 0 0 1-8 0V4Z"/><path d="M4 6h4M16 6h4M9 16h6M12 12v4M8 20h8"/></>,
    racket: <><circle cx="9" cy="9" r="6"/><path d="M13 13l7 7"/><path d="M6.5 9h5M9 6.5v5"/></>,
    shuttle: <><path d="M12 3 18 9l-6 12L6 9z"/><path d="M9 6 12 3l3 3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></>,
    users: <><circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4a4 4 0 0 1 0 8M18 21v-1a6 6 0 0 0-2-4.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    check: <><path d="M5 12l5 5 9-11"/></>,
    x: <><path d="M5 5l14 14M19 5L5 19"/></>,
    chevron: <><path d="M9 6l6 6-6 6"/></>,
    chevronDown: <><path d="M6 9l6 6 6-6"/></>,
    chevronUp: <><path d="M6 15l6-6 6 6"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    arrowLeft: <><path d="M19 12H5M11 18l-6-6 6-6"/></>,
    pin: <><path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    bell: <><path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></>,
    chat: <><path d="M21 12a8 8 0 1 1-3.5-6.6L21 4l-1 4.2A8 8 0 0 1 21 12Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    bolt: <><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    filter: <><path d="M3 5h18l-7 9v6l-4-2v-4L3 5Z"/></>,
    bracket: <><path d="M3 4h4v7h6V4h4v7h4v2h-4v7h-4v-7H7v7H3z"/></>,
    podium: <><rect x="9" y="6" width="6" height="14" rx="1"/><rect x="2" y="11" width="6" height="9" rx="1"/><rect x="16" y="9" width="6" height="11" rx="1"/></>,
    star: <><path d="m12 3 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.5l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3Z"/></>,
    heart: <><path d="M12 20s-7-4.5-9.5-9C1 7.5 4 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3 0 6 3.5 4.5 7C19 15.5 12 20 12 20Z"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 11 6-4M9 13l6 4"/></>,
    menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    live: <><circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0"/></>,
    map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16Z"/><path d="m14 6 4 4"/></>,
    moreH: <><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></>,
    play: <><path d="M6 4v16l14-8Z"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></>,
  };
  return <svg {...props}>{paths[name]}</svg>;
};

/* ---------- BADGES ---------- */
const PhaseBadge = ({ phase, size = 'md' }) => {
  const cfg = {
    'reg-open':   { bg: 'var(--mint-200)',    fg: 'var(--mint-600)',     label: 'Reg Open',   dot: 'var(--mint-400)' },
    'reg-closed': { bg: 'var(--ink-50)',      fg: 'var(--ink-600)',      label: 'Reg Closed', dot: 'var(--ink-300)' },
    'group':      { bg: 'var(--court-200)',   fg: 'var(--court-700)',    label: 'Group Stage',dot: 'var(--court-500)' },
    'knockout':   { bg: 'var(--lavender-200)',fg: 'var(--lavender-700)', label: 'Knockout',   dot: 'var(--lavender-500)' },
    'complete':   { bg: 'var(--gold-200)',    fg: 'var(--gold-600)',     label: 'Complete',   dot: 'var(--gold-400)' },
    'draft':      { bg: 'var(--peach-100)',   fg: 'var(--peach-600)',    label: 'Draft',      dot: 'var(--peach-400)' },
  }[phase] || { bg: 'var(--ink-50)', fg: 'var(--ink-600)', label: phase, dot: 'var(--ink-300)' };
  const pad = size === 'sm' ? '3px 8px 3px 6px' : '5px 10px 5px 8px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 'var(--r-full)',
      background: cfg.bg, color: cfg.fg, fontSize: fs, fontWeight: 700,
      letterSpacing: '0.01em',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: cfg.dot,
        boxShadow: phase === 'group' || phase === 'reg-open' ? `0 0 0 3px ${cfg.dot}33` : 'none',
      }} />
      {cfg.label}
    </span>
  );
};

const Chip = ({ children, variant = 'default', size = 'md', icon }) => {
  const variants = {
    default: { bg: 'var(--surface)', fg: 'var(--ink-700)', bd: 'var(--border)' },
    court:   { bg: 'var(--court-100)', fg: 'var(--court-700)', bd: 'var(--court-200)' },
    lavender:{ bg: 'var(--lavender-100)', fg: 'var(--lavender-700)', bd: 'var(--lavender-200)' },
    mint:    { bg: 'var(--mint-100)', fg: 'var(--mint-600)', bd: 'var(--mint-200)' },
    peach:   { bg: 'var(--peach-100)', fg: 'var(--peach-600)', bd: 'var(--peach-200)' },
    dark:    { bg: 'var(--ink-900)', fg: '#FFFFFF', bd: 'var(--ink-900)' },
  };
  const v = variants[variant];
  const padding = size === 'sm' ? '3px 8px' : '5px 10px';
  const fs = size === 'sm' ? 11 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding, borderRadius: 'var(--r-full)',
      background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
      fontSize: fs, fontWeight: 600,
    }}>
      {icon}{children}
    </span>
  );
};

/* ---------- AVATAR ---------- */
const Avatar = ({ name, size = 36, src, ring, color }) => {
  const initials = name ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : '?';
  // deterministic pastel from name
  const palette = ['#A8D5FF', '#C5AEEF', '#FFB3D9', '#FFDDB3', '#B8EDD0', '#FFE8A3', '#FFB35F', '#A98AE0'];
  const idx = name ? (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % palette.length : 0;
  const bg = color || palette[idx];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: src ? `center/cover url(${src})` : bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--ink-900)', fontWeight: 700, fontSize: size * 0.36,
      letterSpacing: '-0.02em', flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 ${2 + ring}px ${ring}` : '0 0 0 2px var(--surface)',
    }}>
      {!src && initials}
    </div>
  );
};

const AvatarStack = ({ names, size = 28, max = 4, extra }) => {
  const visible = names.slice(0, max);
  const more = extra ?? Math.max(0, names.length - max);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      {visible.map((n, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.32 }}>
          <Avatar name={n} size={size} />
        </div>
      ))}
      {more > 0 && (
        <div style={{
          marginLeft: -size * 0.32,
          width: size, height: size, borderRadius: '50%',
          background: 'var(--ink-100)', color: 'var(--ink-700)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.36, fontWeight: 700,
          boxShadow: '0 0 0 2px var(--surface)',
        }}>+{more}</div>
      )}
    </div>
  );
};

/* ---------- CARD ---------- */
const Card = ({ children, variant = 'default', padding = 20, style = {}, ...rest }) => {
  const variants = {
    default: { bg: 'var(--surface)', bd: 'var(--border-soft)', sh: 'var(--shadow-sm)' },
    flat:    { bg: 'var(--surface)', bd: 'var(--border)', sh: 'none' },
    sunken:  { bg: 'var(--surface-sunken)', bd: 'transparent', sh: 'none' },
    raised:  { bg: 'var(--surface)', bd: 'transparent', sh: 'var(--shadow-md)' },
    glass:   { bg: 'var(--surface-glass)', bd: 'rgba(255,255,255,0.6)', sh: 'var(--shadow-sm)' },
    court:   { bg: 'var(--court-100)', bd: 'var(--court-200)', sh: 'none' },
    lavender:{ bg: 'var(--lavender-100)', bd: 'var(--lavender-200)', sh: 'none' },
    mint:    { bg: 'var(--mint-100)', bd: 'var(--mint-200)', sh: 'none' },
    dark:    { bg: 'var(--ink-900)', bd: 'var(--ink-800)', sh: 'var(--shadow-md)' },
  };
  const v = variants[variant];
  return (
    <div style={{
      background: v.bg, border: `1px solid ${v.bd}`, boxShadow: v.sh,
      borderRadius: 'var(--r-xl)', padding,
      backdropFilter: variant === 'glass' ? 'blur(20px) saturate(1.2)' : undefined,
      ...style,
    }} {...rest}>
      {children}
    </div>
  );
};

/* ---------- STATUS DOT ---------- */
const LiveDot = ({ color = 'var(--mint-400)', label = 'LIVE' }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--mint-600)' }}>
    <span style={{ position: 'relative', width: 8, height: 8 }}>
      <span style={{ position: 'absolute', inset: 0, background: color, borderRadius: '50%' }} />
      <span style={{ position: 'absolute', inset: -3, background: color, borderRadius: '50%', opacity: 0.4, animation: 'uacPulse 1.8s ease-out infinite' }} />
    </span>
    {label}
  </span>
);

// inject pulse keyframes once
if (typeof document !== 'undefined' && !document.getElementById('uac-anim')) {
  const s = document.createElement('style');
  s.id = 'uac-anim';
  s.textContent = `
    @keyframes uacPulse {
      0% { transform: scale(0.6); opacity: 0.6; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes uacShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  `;
  document.head.appendChild(s);
}

/* ---------- TONAL SECTION HEADER ---------- */
const SectionHeading = ({ eyebrow, title, subtitle }) => (
  <div style={{ marginBottom: 24 }}>
    {eyebrow && (
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--court-600)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
        {eyebrow}
      </div>
    )}
    <h2 className="uac-display" style={{ fontSize: 28, fontWeight: 600, color: 'var(--ink-900)', margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
    {subtitle && <p style={{ marginTop: 6, color: 'var(--ink-500)', fontSize: 14 }}>{subtitle}</p>}
  </div>
);

/* ---------- TINY SHUTTLE GRAPHIC ---------- */
// Stylized badminton shuttlecock used as a decorative motif.
const Shuttle = ({ size = 32, color = 'var(--court-400)', tip = 'var(--court-600)' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    {/* feathers */}
    <path d="M24 6 L36 18 L34 28 L14 28 L12 18 Z" fill={color} opacity="0.85" />
    <path d="M24 6 L24 28 M19 9 L17 28 M29 9 L31 28" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.9" />
    {/* cork base */}
    <ellipse cx="24" cy="32" rx="10" ry="6" fill={tip} />
    <ellipse cx="24" cy="31" rx="10" ry="4" fill="#FFFFFF" opacity="0.25" />
  </svg>
);

/* ---------- COURT DOODLE ---------- */
// Top-down badminton court schematic, used as decorative bg.
const CourtDoodle = ({ width = 220, height = 110, color = 'var(--court-300)', bg = 'var(--court-50)' }) => (
  <svg width={width} height={height} viewBox="0 0 220 110" aria-hidden="true">
    <rect x="6" y="6" width="208" height="98" rx="4" fill={bg} stroke={color} strokeWidth="1.5" />
    <line x1="110" y1="6" x2="110" y2="104" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />
    <line x1="6" y1="55" x2="214" y2="55" stroke={color} strokeWidth="1" opacity="0.5" />
    <rect x="36" y="30" width="148" height="50" fill="none" stroke={color} strokeWidth="1" opacity="0.5" />
  </svg>
);

Object.assign(window, {
  LogoMark, Logo, Button, Icon, PhaseBadge, Chip, Avatar, AvatarStack,
  Card, LiveDot, SectionHeading, Shuttle, CourtDoodle,
});
