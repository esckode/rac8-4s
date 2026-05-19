// =====================================================
// Mobile screens — the primary form factor
// 390 × 844 (iPhone reference). Each artboard is one screen.
// =====================================================

const PHONE_W = 390;
const PHONE_H = 844;

// Reusable phone shell — soft pastel app bg, status bar, content
const PhoneShell = ({ children, statusBg = 'transparent', bg = 'var(--bg-app)', overflow = 'hidden' }) => (
  <div style={{
    width: PHONE_W, height: PHONE_H,
    background: bg, fontFamily: 'var(--font-ui)', color: 'var(--ink-900)',
    position: 'relative', overflow,
    display: 'flex', flexDirection: 'column',
  }}>
    {/* Status bar */}
    <div style={{
      height: 44, padding: '0 24px', background: statusBg,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="16" height="10" viewBox="0 0 16 10"><path d="M0 8h2v2H0zM4 6h2v4H4zM8 3h2v7H8zM12 0h2v10h-2z" fill="var(--ink-900)"/></svg>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 4a8 8 0 0 1 12 0M3 6a5 5 0 0 1 8 0M5 8a2 2 0 0 1 4 0" stroke="var(--ink-900)" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <svg width="22" height="10" viewBox="0 0 22 10"><rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke="var(--ink-900)" strokeOpacity=".5"/><rect x="2" y="2" width="14" height="6" rx="1" fill="var(--ink-900)"/></svg>
      </div>
    </div>
    {children}
  </div>
);

// Tab bar
const TabBar = ({ active = 'home' }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'browse', label: 'Browse', icon: 'search' },
    { id: 'play', label: 'Play', icon: 'racket' },
    { id: 'me', label: 'Profile', icon: 'user' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'var(--surface-glass)', backdropFilter: 'blur(20px) saturate(1.4)',
      borderTop: '1px solid var(--border-soft)',
      padding: '10px 16px 28px',
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => (
        <div key={t.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          color: active === t.id ? 'var(--court-700)' : 'var(--ink-400)',
        }}>
          {t.id === 'play' ? (
            <div style={{
              width: 48, height: 48, borderRadius: 16, marginTop: -16,
              background: active === 'play' ? 'var(--court-400)' : 'var(--ink-900)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow-md)',
            }}>
              <Icon name="racket" size={22} color="#FFFFFF" />
            </div>
          ) : (
            <Icon name={t.icon} size={22} strokeWidth={active === t.id ? 2.4 : 2} />
          )}
          <span style={{ fontSize: 10, fontWeight: 700 }}>{t.label}</span>
        </div>
      ))}
    </div>
  );
};

const ScreenHeader = ({ title, sub, right, dark = false, withBack = false }) => (
  <div style={{ padding: '12px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
      {withBack && (
        <button style={{
          width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
          background: dark ? 'rgba(255,255,255,0.12)' : 'var(--surface)',
          color: dark ? '#FFFFFF' : 'var(--ink-900)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: dark ? 'none' : 'var(--shadow-xs)',
        }}><Icon name="arrowLeft" size={18} /></button>
      )}
      <div style={{ minWidth: 0 }}>
        <h1 className="uac-display" style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: dark ? '#FFFFFF' : 'var(--ink-900)' }}>{title}</h1>
        {sub && <div style={{ fontSize: 12, color: dark ? 'rgba(255,255,255,0.7)' : 'var(--ink-500)', fontWeight: 500, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
    {right}
  </div>
);

/* ============== 01. AUTH / LANDING ============== */
const MobileLanding = () => (
  <PhoneShell bg="linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)" statusBg="transparent">
    <div style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}>
      <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
        <circle cx="320" cy="120" r="180" fill="#7BC3FF" opacity="0.5" />
        <circle cx="60" cy="500" r="200" fill="#A98AE0" opacity="0.4" />
      </svg>
    </div>
    <div style={{ position: 'relative', flex: 1, padding: '0 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ paddingTop: 32 }}>
        <Logo size={20} tone="light" />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <LogoMark size={88} color="#A8D5FF" accent="#7BC3FF" />
        </div>
        <div className="uac-display" style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', color: '#FFFFFF', lineHeight: 1.05 }}>
          See you at<br/>the court.
        </div>
        <div style={{ marginTop: 16, fontSize: 16, color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, maxWidth: 320 }}>
          Find drop-in nights, join your club's leagues, and run friendly tournaments — all on the sideline.
        </div>
      </div>

      <div style={{ paddingBottom: 36, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button variant="primary" size="lg" fullWidth>Continue with email</Button>
        <Button variant="ghost" size="lg" fullWidth
          style={{ background: 'rgba(255,255,255,0.08)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.18)' }}>
          Browse tournaments
        </Button>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
          New here? An account creates itself when you join your first night.
        </div>
      </div>
    </div>
  </PhoneShell>
);

/* ============== 02. HOME / DASHBOARD ============== */
const MobileHome = () => (
  <PhoneShell>
    <ScreenHeader
      title="Hi, Aanya"
      sub="Tonight you're playing at Riverside SC"
      right={(
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Icon name="bell" size={18} />
            <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: 'var(--rose-400)', borderRadius: '50%', border: '2px solid var(--surface)' }} />
          </button>
          <Avatar name="Aanya Patel" size={38} />
        </div>
      )}
    />
    <div style={{ flex: 1, overflow: 'hidden', padding: '4px 20px 110px' }}>
      {/* Hero card: tonight */}
      <div style={{
        background: 'linear-gradient(135deg, #1F2D4E 0%, #1F6BAA 100%)',
        borderRadius: 'var(--r-2xl)', padding: 18,
        color: '#FFFFFF', position: 'relative', overflow: 'hidden',
        marginBottom: 18,
      }}>
        <div style={{ position: 'absolute', right: -12, bottom: -12, opacity: 0.35 }}>
          <Shuttle size={140} color="#A8D5FF" tip="#7BC3FF" />
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>
            <LiveDot color="#7BC3FF" label="HAPPENING TONIGHT" />
          </div>
          <div className="uac-display" style={{ fontSize: 24, fontWeight: 600, marginTop: 10, letterSpacing: '-0.02em' }}>Friday Night Smash</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>16 teams · group stage · 7:00 PM</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="primary" size="sm" style={{ background: '#FFFFFF', color: 'var(--ink-900)' }}>View standings</Button>
            <Button variant="ghost" size="sm" style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>Get directions</Button>
          </div>
        </div>
      </div>

      {/* My next match */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your next match</h3>
        <span style={{ fontSize: 12, color: 'var(--court-600)', fontWeight: 700 }}>in 25 min</span>
      </div>
      <MatchCard m={MATCHES[2]} compact />

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 18 }}>
        {[
          { ic: 'plus', label: 'Host night', bg: 'var(--court-100)', fg: 'var(--court-700)' },
          { ic: 'search', label: 'Find court', bg: 'var(--lavender-100)', fg: 'var(--lavender-700)' },
          { ic: 'trophy', label: 'Tournaments', bg: 'var(--mint-100)', fg: 'var(--mint-600)' },
          { ic: 'users', label: 'My club', bg: 'var(--peach-100)', fg: 'var(--peach-600)' },
        ].map(a => (
          <div key={a.label} style={{
            background: a.bg, padding: '14px 8px', borderRadius: 'var(--r-lg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <Icon name={a.ic} size={20} color={a.fg} />
            <span style={{ fontSize: 11, fontWeight: 700, color: a.fg }}>{a.label}</span>
          </div>
        ))}
      </div>

      {/* My tournaments */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '20px 0 10px' }}>
        <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>You're in</h3>
        <span style={{ fontSize: 12, color: 'var(--court-600)', fontWeight: 700 }}>See all</span>
      </div>
      <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
        <div style={{ flex: '0 0 240px' }}><TournamentCard t={TOURNAMENTS[0]} compact /></div>
        <div style={{ flex: '0 0 240px' }}><TournamentCard t={TOURNAMENTS[1]} compact /></div>
      </div>
    </div>
    <TabBar active="home" />
  </PhoneShell>
);

/* ============== 03. BROWSE TOURNAMENTS ============== */
const MobileBrowse = () => (
  <PhoneShell>
    <ScreenHeader
      title="Browse"
      sub="Find a night, find a tournament"
      right={<button style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="filter" size={18} /></button>}
    />
    <div style={{ padding: '4px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 44, background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
        <Icon name="search" size={18} color="var(--ink-400)" />
        <span style={{ fontSize: 14, color: 'var(--ink-400)' }}>Search clubs, players, venues…</span>
      </div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12, overflow: 'hidden' }}>
        <Chip variant="dark" size="sm">All</Chip>
        <Chip variant="default" size="sm">Doubles</Chip>
        <Chip variant="default" size="sm">Singles</Chip>
        <Chip variant="default" size="sm">Mixed</Chip>
        <Chip variant="default" size="sm" icon={<Icon name="pin" size={11} />}>Near me</Chip>
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '16px 20px 110px' }}>
      {/* Featured */}
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--court-600)', letterSpacing: '0.12em', marginBottom: 10 }}>
        FEATURED · THIS WEEK
      </div>
      <TournamentCard t={TOURNAMENTS[2]} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '20px 0 10px' }}>
        <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Coming up</h3>
        <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>4 results</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TournamentRow t={TOURNAMENTS[1]} />
        <TournamentRow t={TOURNAMENTS[3]} />
        <TournamentRow t={TOURNAMENTS[0]} />
      </div>
    </div>
    <TabBar active="browse" />
  </PhoneShell>
);

const TournamentRow = ({ t }) => {
  const covers = {
    court:    'var(--court-200)', lavender: 'var(--lavender-200)',
    mint:     'var(--mint-200)',  peach:    'var(--peach-200)', gold: 'var(--gold-200)',
  };
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-soft)',
      borderRadius: 'var(--r-xl)', padding: 14,
      display: 'flex', gap: 14, alignItems: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 'var(--r-md)',
        background: covers[t.cover], flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Shuttle size={36} color="rgba(255,255,255,0.95)" tip="rgba(255,255,255,0.8)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="uac-display" style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{t.name}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>{t.date} · {t.venue}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <PhaseBadge phase={t.phase} size="sm" />
          <Chip variant="default" size="sm" icon={<Icon name="users" size={11} />}>{t.players}/{t.capacity}</Chip>
        </div>
      </div>
    </div>
  );
};

/* ============== 04. TOURNAMENT DETAILS / REGISTER ============== */
const MobileTournamentDetail = () => (
  <PhoneShell statusBg="var(--lavender-300)">
    {/* Hero cover */}
    <div style={{
      background: 'linear-gradient(135deg, var(--lavender-300) 0%, var(--lavender-400) 100%)',
      padding: '0 20px 24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', right: -40, bottom: -30, opacity: 0.4 }}>
        <Shuttle size={220} color="rgba(255,255,255,0.9)" tip="rgba(255,255,255,0.7)" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 18px' }}>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.4)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="arrowLeft" size={18} />
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.4)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="heart" size={18} />
          </button>
          <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.4)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="share" size={18} />
          </button>
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <PhaseBadge phase="reg-open" />
        <h1 className="uac-display" style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', margin: '10px 0 4px', color: 'var(--ink-900)' }}>
          Spring Singles Cup
        </h1>
        <div style={{ fontSize: 14, color: 'var(--lavender-700)', fontWeight: 600 }}>Hosted by Eastside Smash</div>
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '16px 20px 130px' }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'When', value: 'Sat 24 May', sub: '10:00 AM' },
          { label: 'Where', value: 'Eastside', sub: '4 courts' },
          { label: 'Spots', value: '10 left', sub: 'of 32' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', padding: 12, borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</div>
            <div className="uac-display" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Format */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip variant="court" icon={<Icon name="shuttle" size={11} />}>Badminton</Chip>
        <Chip variant="lavender">Singles</Chip>
        <Chip variant="default">Best of 3</Chip>
        <Chip variant="default">21 points</Chip>
        <Chip variant="default">All levels</Chip>
      </div>

      <h3 className="uac-display" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>About this tournament</h3>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-600)', lineHeight: 1.55 }}>
        Open to all levels. Group stage Saturday morning, knockout Saturday afternoon. Snacks and drinks on site — bring a friend.
      </p>

      <h3 className="uac-display" style={{ margin: '20px 0 10px', fontSize: 16, fontWeight: 600 }}>Already registered (22)</h3>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <AvatarStack names={['Aanya Patel','Marcus Tan','Priya Iyer','Daniel Cho','Lila Okonkwo','Jonas Berg']} size={36} max={5} extra={17} />
        <Button variant="ghost" size="sm" iconRight={<Icon name="chevron" size={14} />}>View all</Button>
      </div>

      <h3 className="uac-display" style={{ margin: '20px 0 10px', fontSize: 16, fontWeight: 600 }}>Organizer</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-md)' }}>
        <Avatar name="Eastside Smash" size={40} color="var(--court-300)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Eastside Smash</div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Hosting since 2021 · 47 tournaments</div>
        </div>
        <Icon name="chevron" size={16} color="var(--ink-400)" />
      </div>
    </div>

    {/* Sticky CTA */}
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 20px 28px', background: 'var(--surface-glass)',
      backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border-soft)',
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <div style={{ flex: 1 }}>
        <div className="uac-display" style={{ fontSize: 22, fontWeight: 600 }}>Free</div>
        <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>Reg closes Fri</div>
      </div>
      <Button variant="primaryBold" size="lg" iconRight={<Icon name="arrow" size={16} color="#FFF" />}>Register</Button>
    </div>
  </PhoneShell>
);

/* ============== 05. STANDINGS (LIVE) ============== */
const MobileStandings = () => (
  <PhoneShell>
    <ScreenHeader
      title="Friday Night Smash"
      sub="Group A · 4 teams"
      withBack
      right={<Chip variant="dark" size="sm" icon={<Icon name="bolt" size={11} />}>LIVE</Chip>}
    />
    {/* Sub-nav */}
    <div style={{ padding: '0 20px' }}>
      <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--ink-50)', borderRadius: 'var(--r-md)' }}>
        {['Standings','Matches','Groups','Bracket'].map((t, i) => (
          <div key={t} style={{
            flex: 1, textAlign: 'center', padding: '8px 0',
            fontSize: 12, fontWeight: 700,
            background: i === 0 ? 'var(--surface)' : 'transparent',
            color: i === 0 ? 'var(--ink-900)' : 'var(--ink-500)',
            borderRadius: 'var(--r-sm)',
            boxShadow: i === 0 ? 'var(--shadow-xs)' : 'none',
          }}>{t}</div>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '14px 20px 110px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>Updates live as scores are submitted</div>
        <button style={{ background: 'transparent', border: 'none', color: 'var(--court-600)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="users" size={12} /> Group A
        </button>
      </div>

      {/* Compact mobile standings */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
        {STANDINGS.map((r, i) => (
          <div key={r.rank} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 14px', borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none',
            background: i === 0 ? 'linear-gradient(90deg, var(--gold-200) 0%, transparent 50%)' : 'transparent',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: i === 0 ? 'var(--gold-200)' : (i === 1 ? 'var(--court-100)' : 'var(--ink-50)'),
              color: i === 0 ? 'var(--gold-600)' : 'var(--ink-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13,
            }}>{r.rank}</div>
            <AvatarStack names={r.team.players} size={26} max={2} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.team.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{r.w}W · {r.l}L · {r.setDiff}</div>
            </div>
            <div className="uac-num" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{r.pts}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.08em' }}>PTS</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: 14, background: 'var(--court-100)', border: '1px solid var(--court-200)', borderRadius: 'var(--r-md)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon name="info" size={18} color="var(--court-700)" />
        <div style={{ fontSize: 12, color: 'var(--court-900)', lineHeight: 1.5 }}>
          <strong>Top 2 advance.</strong> Tie-breakers: head-to-head, then set difference, then points scored.
        </div>
      </div>

      {/* Next match cta */}
      <div style={{
        marginTop: 16, padding: 16, borderRadius: 'var(--r-xl)',
        background: 'var(--ink-900)', color: '#FFFFFF',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="bolt" size={22} color="#A8D5FF" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#7BC3FF', letterSpacing: '0.1em' }}>YOUR NEXT MATCH</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>vs. Lila & Jonas · Court 3 · 7:45 PM</div>
        </div>
        <Icon name="chevron" size={18} color="rgba(255,255,255,0.6)" />
      </div>
    </div>

    <TabBar active="play" />
  </PhoneShell>
);

/* ============== 06. MATCH DETAIL + SCORE ENTRY ============== */
const MobileMatchScore = () => (
  <PhoneShell statusBg="var(--court-100)">
    <ScreenHeader title="Submit score" sub="Group A · Round 2 · Court 3" withBack />
    <div style={{ flex: 1, overflow: 'hidden', padding: '8px 20px 110px' }}>
      {/* Match header card */}
      <div style={{
        padding: 18, borderRadius: 'var(--r-xl)',
        background: 'linear-gradient(135deg, var(--court-100), var(--court-200))',
        border: '1px solid var(--court-200)', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <AvatarStack names={TEAMS[0].players} size={44} max={2} />
            <div className="uac-display" style={{ marginTop: 8, fontWeight: 600, fontSize: 15 }}>Aanya & Marcus</div>
            <Chip variant="dark" size="sm">YOU</Chip>
          </div>
          <div className="uac-display" style={{ fontSize: 18, fontWeight: 600, color: 'var(--court-700)', padding: '0 12px' }}>vs</div>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <AvatarStack names={TEAMS[2].players} size={44} max={2} />
            <div className="uac-display" style={{ marginTop: 8, fontWeight: 600, fontSize: 15 }}>Lila & Jonas</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>Eastside Smash</div>
          </div>
        </div>
      </div>

      {/* Score input */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', padding: 18, border: '1px solid var(--border-soft)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Enter scores</h3>
          <span style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600 }}>Best of 3 · to 21</span>
        </div>
        {['Game 1','Game 2','Game 3'].map((g, i) => (
          <div key={g} style={{
            display: 'grid', gridTemplateColumns: '60px 1fr 16px 1fr',
            alignItems: 'center', padding: '12px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)',
            opacity: i === 2 ? 0.5 : 1,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>{g}</span>
            <Stepper value={i === 2 ? 0 : [21,19][i]} />
            <span style={{ textAlign: 'center', color: 'var(--ink-400)', fontWeight: 700 }}>–</span>
            <Stepper value={i === 2 ? 0 : [18,21][i]} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: 14, background: 'var(--peach-100)', border: '1px solid var(--peach-200)', borderRadius: 'var(--r-md)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon name="clock" size={18} color="var(--peach-600)" />
        <div style={{ fontSize: 12, color: 'var(--peach-600)', lineHeight: 1.5 }}>
          <strong>Both teams should agree.</strong> Lila or Jonas will be asked to confirm before scores go live.
        </div>
      </div>
    </div>

    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 20px 28px', background: 'var(--surface-glass)',
      backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border-soft)',
      display: 'flex', gap: 10,
    }}>
      <Button variant="ghost" size="lg" style={{ flex: 1 }}>Cancel</Button>
      <Button variant="primaryBold" size="lg" style={{ flex: 2 }} icon={<Icon name="check" size={18} color="#FFF" strokeWidth={3} />}>Submit</Button>
    </div>
  </PhoneShell>
);

/* ============== 07. BRACKET (LIVE) ============== */
const MobileBracket = () => (
  <PhoneShell>
    <ScreenHeader
      title="Knockout Friday"
      sub="Final · tonight"
      withBack
      right={<Chip variant="dark" size="sm" icon={<Icon name="bolt" size={11} />}>LIVE</Chip>}
    />
    <div style={{ padding: '0 20px' }}>
      <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--ink-50)', borderRadius: 'var(--r-md)' }}>
        {['Standings','Matches','Groups','Bracket'].map((t, i) => (
          <div key={t} style={{
            flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 12, fontWeight: 700,
            background: i === 3 ? 'var(--surface)' : 'transparent',
            color: i === 3 ? 'var(--ink-900)' : 'var(--ink-500)',
            borderRadius: 'var(--r-sm)', boxShadow: i === 3 ? 'var(--shadow-xs)' : 'none',
          }}>{t}</div>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '14px 20px 110px' }}>
      {/* Mobile bracket is laid out vertically by round */}
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--court-600)', letterSpacing: '0.12em', marginBottom: 10 }}>QUARTER-FINALS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {BRACKET_QF.map((m, i) => <BracketMatch key={m.id} m={m} highlight={i === 0} />)}
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--lavender-500)', letterSpacing: '0.12em', margin: '20px 0 10px' }}>SEMI-FINALS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BracketMatch m={{ a: TEAMS[0], b: TEAMS[1], score: '2-0' }} />
        <BracketMatch m={{ a: { name: 'Wong & Park', short: 'W&P', color: 'var(--pink-300)' }, b: { name: 'Ali & Brooks', short: 'A&B', color: 'var(--mint-200)' }, score: '1-2' }} />
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold-600)', letterSpacing: '0.12em', margin: '20px 0 10px' }}>FINAL · LIVE</div>
      <div style={{
        padding: 16, borderRadius: 'var(--r-xl)',
        background: 'linear-gradient(135deg, var(--gold-200) 0%, #FFE48A 100%)',
        border: '2px solid var(--gold-400)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Icon name="trophy" size={18} color="var(--gold-600)" />
          <LiveDot />
        </div>
        {[
          { t: TEAMS[0], score: '21', score2: '14', win: true },
          { t: { name: 'Ali & Brooks', short: 'A&B', color: 'var(--mint-200)' }, score: '14', score2: '21' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: i === 1 ? '1px solid rgba(0,0,0,0.08)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: row.t.color, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{row.t.short}</div>
              <span style={{ fontWeight: row.win ? 800 : 600, fontSize: 14 }}>{row.t.name}</span>
            </div>
            <div className="uac-num" style={{ display: 'flex', gap: 12, fontWeight: 800, fontSize: 18 }}>
              <span>{row.score}</span><span>{row.score2}</span>
            </div>
          </div>
        ))}
      </div>
    </div>

    <TabBar active="play" />
  </PhoneShell>
);

/* ============== 08. PROFILE ============== */
const MobileProfile = () => (
  <PhoneShell>
    {/* Profile hero */}
    <div style={{
      background: 'linear-gradient(135deg, var(--court-300) 0%, var(--lavender-300) 100%)',
      padding: '20px 20px 70px', position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.4)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="settings" size={18} />
        </button>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.4)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="share" size={18} />
        </button>
      </div>
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '0 20px 110px', position: 'relative' }}>
      <div style={{ marginTop: -54, display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <div style={{ boxShadow: '0 0 0 4px var(--surface-tint)', borderRadius: '50%' }}>
          <Avatar name="Aanya Patel" size={88} />
        </div>
        <div style={{ paddingBottom: 6 }}>
          <h2 className="uac-display" style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Aanya Patel</h2>
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>@aanya · Riverside SC</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 20 }}>
        {[
          { v: '1820', l: 'Rating' },
          { v: '47', l: 'Matches' },
          { v: '32', l: 'Wins' },
          { v: '6', l: 'Trophies' },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--surface)', padding: 12, borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)', textAlign: 'center' }}>
            <div className="uac-display" style={{ fontSize: 18, fontWeight: 600 }}>{s.v}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <h3 className="uac-display" style={{ margin: '24px 0 10px', fontSize: 16, fontWeight: 600 }}>Trophies</h3>
      <div style={{ display: 'flex', gap: 10, overflow: 'hidden' }}>
        {[
          { c: 'var(--gold-200)', ic: 'trophy', l: 'Spring Open' },
          { c: 'var(--court-200)', ic: 'star', l: '50 matches' },
          { c: 'var(--mint-200)', ic: 'bolt', l: '10W streak' },
          { c: 'var(--lavender-200)', ic: 'heart', l: 'Friendly' },
        ].map(t => (
          <div key={t.l} style={{
            flex: '0 0 78px', textAlign: 'center', padding: '12px 4px',
            background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)',
          }}>
            <div style={{ width: 44, height: 44, margin: '0 auto', borderRadius: '50%', background: t.c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={t.ic} size={20} />
            </div>
            <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700 }}>{t.l}</div>
          </div>
        ))}
      </div>

      {/* Recent matches */}
      <h3 className="uac-display" style={{ margin: '24px 0 10px', fontSize: 16, fontWeight: 600 }}>Recent matches</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { opp: 'Mei & Ravi', score: '21-18, 19-21, 14-9', w: true, when: '2h ago' },
          { opp: 'Marcus T.', score: '21-14, 21-17', w: true, when: 'Mon' },
          { opp: 'Priya I.', score: '14-21, 18-21', w: false, when: 'Last Fri' },
        ].map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 12, background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: m.w ? 'var(--mint-200)' : 'var(--rose-100)',
              color: m.w ? 'var(--mint-600)' : 'var(--rose-600)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13,
            }}>{m.w ? 'W' : 'L'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>vs. {m.opp}</div>
              <div className="uac-num" style={{ fontSize: 12, color: 'var(--ink-500)' }}>{m.score}</div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600 }}>{m.when}</span>
          </div>
        ))}
      </div>
    </div>

    <TabBar active="me" />
  </PhoneShell>
);

Object.assign(window, {
  PhoneShell, TabBar, ScreenHeader,
  MobileLanding, MobileHome, MobileBrowse, MobileTournamentDetail,
  MobileStandings, MobileMatchScore, MobileBracket, MobileProfile,
});
