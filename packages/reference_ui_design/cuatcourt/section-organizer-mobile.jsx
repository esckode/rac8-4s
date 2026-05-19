// =====================================================
// Organizer · Mobile screens
// The organizer's phone is for courtside, mid-tournament work:
// see what's live, fix scores, broadcast updates, check players in.
// Same 390 × 844 phone shell; same design language as player mobile,
// but with denser data + organizer-only affordances.
// =====================================================

/* ---------- Local helpers (organizer-flavored) ---------- */

// Organizer-specific tab bar — replaces Player's "Browse / Play / Profile"
// with the four jobs you actually do mid-tournament.
const OrgTabBar = ({ active = 'live' }) => {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'home' },
    { id: 'live',     label: 'Live',     icon: 'bolt' },
    { id: 'roster',   label: 'Roster',   icon: 'users' },
    { id: 'broadcast',label: 'Broadcast',icon: 'bell' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'var(--surface-glass)', backdropFilter: 'blur(20px) saturate(1.4)',
      borderTop: '1px solid var(--border-soft)',
      padding: '10px 12px 28px',
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => (
        <div key={t.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          color: active === t.id ? 'var(--court-700)' : 'var(--ink-400)',
        }}>
          {t.id === 'live' ? (
            <div style={{
              width: 48, height: 48, borderRadius: 16, marginTop: -16,
              background: active === 'live'
                ? 'linear-gradient(135deg, var(--court-500), var(--court-700))'
                : 'var(--ink-900)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow-md)', position: 'relative',
            }}>
              <Icon name="bolt" size={22} color="#FFFFFF" />
              {active === 'live' && (
                <span style={{
                  position: 'absolute', top: 4, right: 4, width: 10, height: 10,
                  background: 'var(--rose-400)', borderRadius: '50%',
                  border: '2px solid var(--surface)',
                }} />
              )}
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

// A "running tournament" mini-card the organizer sees on overview.
const OrgRunningCard = ({ name, venue, progress, courts, alerts = 0, accent }) => (
  <div style={{
    background: 'var(--surface)', border: '1px solid var(--border-soft)',
    borderRadius: 'var(--r-xl)', padding: 14,
    position: 'relative', overflow: 'hidden',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: accent, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Shuttle size={26} color="rgba(255,255,255,0.95)" tip="rgba(255,255,255,0.75)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="uac-display" style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{venue} · {courts} courts</div>
      </div>
      {alerts > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--rose-100)', color: 'var(--rose-600)',
          padding: '4px 8px', borderRadius: 999,
          fontSize: 11, fontWeight: 800,
        }}>
          <span style={{ width: 6, height: 6, background: 'var(--rose-400)', borderRadius: '50%' }} />
          {alerts}
        </div>
      )}
    </div>
    {/* progress */}
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--ink-500)', marginBottom: 4, letterSpacing: '0.04em' }}>
        <span>{progress.label}</span>
        <span className="uac-num">{progress.done}/{progress.total} matches</span>
      </div>
      <div style={{ height: 6, background: 'var(--ink-50)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${(progress.done / progress.total) * 100}%`, height: '100%',
          background: `linear-gradient(90deg, ${accent}, var(--court-500))`,
          borderRadius: 3,
        }} />
      </div>
    </div>
  </div>
);

/* ============== 01. ORGANIZER OVERVIEW (MOBILE) ============== */
const MobileOrgOverview = () => (
  <PhoneShell>
    <ScreenHeader
      title="Tonight"
      sub="Friday, 24 May · 2 live"
      right={(
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            width: 38, height: 38, borderRadius: 10, background: 'var(--surface)',
            border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <Icon name="bell" size={18} />
            <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: 'var(--rose-400)', borderRadius: '50%', border: '2px solid var(--surface)' }} />
          </button>
          <Avatar name="Marcus Tan" size={38} color="var(--lavender-300)" />
        </div>
      )}
    />

    <div style={{ flex: 1, overflow: 'hidden', padding: '4px 20px 110px' }}>
      {/* "Now" alert pulled to the top */}
      <div style={{
        background: 'linear-gradient(135deg, var(--ink-900), #1F2D4E)', color: '#FFFFFF',
        borderRadius: 'var(--r-2xl)', padding: 18, marginBottom: 16, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -20, top: -10, opacity: 0.2 }}>
          <Icon name="bolt" size={120} color="#7BC3FF" />
        </div>
        <div style={{ position: 'relative' }}>
          <LiveDot color="#7BC3FF" label="ATTENTION NEEDED" />
          <div className="uac-display" style={{ fontSize: 20, fontWeight: 600, marginTop: 8, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Court 3 dispute — Game 2 score
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
            Aanya &amp; Marcus vs. Lila &amp; Jonas · waiting on you · 4 min
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="primary" size="sm" style={{ background: '#FFFFFF', color: 'var(--ink-900)' }}>Review</Button>
            <Button variant="ghost" size="sm" style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>Dismiss</Button>
          </div>
        </div>
      </div>

      {/* Snapshot stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 18 }}>
        {[
          { v: '28', l: 'Live matches', c: 'var(--court-600)' },
          { v: '64', l: 'Players in',    c: 'var(--lavender-700)' },
          { v: '92%', l: 'On schedule', c: 'var(--mint-600)' },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--surface)', padding: 12, borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
            <div className="uac-display" style={{ fontSize: 22, fontWeight: 600, color: s.c, letterSpacing: '-0.02em' }}>{s.v}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Running tournaments */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Running now</h3>
        <span style={{ fontSize: 12, color: 'var(--court-600)', fontWeight: 700 }}>2 live</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <OrgRunningCard
          name="Friday Night Smash"
          venue="Riverside SC"
          courts={4}
          alerts={2}
          accent="var(--court-300)"
          progress={{ label: 'GROUP STAGE', done: 14, total: 24 }}
        />
        <OrgRunningCard
          name="Spring Singles Cup"
          venue="Eastside Smash"
          courts={6}
          alerts={0}
          accent="var(--lavender-300)"
          progress={{ label: 'QUARTER-FINALS', done: 6, total: 8 }}
        />
      </div>

      {/* Quick organizer actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 18 }}>
        {[
          { ic: 'plus',  label: 'New tourn.', bg: 'var(--court-100)',    fg: 'var(--court-700)' },
          { ic: 'check', label: 'Check-in',   bg: 'var(--mint-100)',     fg: 'var(--mint-600)' },
          { ic: 'bell',  label: 'Broadcast',  bg: 'var(--peach-100)',    fg: 'var(--peach-600)' },
          { ic: 'edit',  label: 'Override',   bg: 'var(--lavender-100)', fg: 'var(--lavender-700)' },
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
    </div>

    <OrgTabBar active="overview" />
  </PhoneShell>
);

/* ============== 02. LIVE MONITOR (MOBILE) ============== */
// Courtside view — what's playing on every court right now.
const MobileOrgLiveMonitor = () => {
  const courts = [
    { n: 1, status: 'live',   teamA: 'Aanya & Marcus', teamB: 'Lila & Jonas', score: '21-18, 19-21, 12-9', round: 'Group A · R2', flag: null },
    { n: 2, status: 'live',   teamA: 'Priya & Daniel', teamB: 'Mei & Ravi',   score: '14-11', round: 'Group B · R2', flag: null },
    { n: 3, status: 'flag',   teamA: 'Wong & Park',    teamB: 'Ali & Brooks', score: '21-19, 14-18', round: 'Group A · R2', flag: 'Score dispute' },
    { n: 4, status: 'idle',   teamA: '— next —',       teamB: 'Berg & Iyer vs. Cho & Singh', score: 'in 5 min', round: 'Group B · R3', flag: null },
  ];

  return (
    <PhoneShell>
      <ScreenHeader
        title="Live monitor"
        sub="Friday Night Smash · Riverside SC"
        withBack
        right={<Chip variant="dark" size="sm" icon={<Icon name="bolt" size={11} />}>4 COURTS</Chip>}
      />
      {/* Sub-nav */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--ink-50)', borderRadius: 'var(--r-md)' }}>
          {['Courts','Queue','Bracket','Standings'].map((t, i) => (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {courts.map(c => {
            const isLive = c.status === 'live';
            const isFlag = c.status === 'flag';
            const isIdle = c.status === 'idle';
            return (
              <div key={c.n} style={{
                background: isFlag ? 'linear-gradient(135deg, var(--rose-100), #FFE6E6)' : 'var(--surface)',
                border: isFlag ? '1.5px solid var(--rose-400)' : '1px solid var(--border-soft)',
                borderRadius: 'var(--r-xl)', padding: 14,
                opacity: isIdle ? 0.7 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: isLive ? 'var(--ink-900)' : isFlag ? 'var(--rose-400)' : 'var(--ink-100)',
                      color: '#FFFFFF', fontSize: 13, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{c.n}</div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)' }}>{c.round}</div>
                      {isLive && <LiveDot />}
                      {isFlag && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: 'var(--rose-600)', letterSpacing: '0.06em' }}>
                          <Icon name="info" size={11} color="var(--rose-600)" /> {c.flag.toUpperCase()}
                        </div>
                      )}
                      {isIdle && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.06em' }}>NEXT UP</span>}
                    </div>
                  </div>
                  <button style={{ background: 'transparent', border: 'none', padding: 4 }}>
                    <Icon name="moreH" size={18} color="var(--ink-400)" />
                  </button>
                </div>

                {!isIdle ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)' }}>{c.teamA}</span>
                      <span className="uac-num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-700)' }}>{c.score.split(',')[0]}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-700)' }}>{c.teamB}</span>
                      <span className="uac-num" style={{ fontSize: 13, color: 'var(--ink-500)' }}>{c.score.split(',').slice(1).join(',') || '—'}</span>
                    </div>
                    {isFlag && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--rose-200)' }}>
                        <Button variant="primaryBold" size="sm" style={{ flex: 1 }}>Resolve</Button>
                        <Button variant="ghost" size="sm" style={{ flex: 1 }}>Open chat</Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--ink-600)' }}>{c.teamB} · <span style={{ color: 'var(--court-700)', fontWeight: 700 }}>{c.score}</span></div>
                )}
              </div>
            );
          })}
        </div>

        {/* Big pause CTA */}
        <div style={{ marginTop: 16, padding: 14, background: 'var(--peach-100)', border: '1px solid var(--peach-200)', borderRadius: 'var(--r-md)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Icon name="clock" size={20} color="var(--peach-600)" />
          <div style={{ flex: 1, fontSize: 12, color: 'var(--peach-600)', lineHeight: 1.45 }}>
            <strong>Need to pause everything?</strong> Bracket halts and players get a push.
          </div>
          <Button variant="ghost" size="sm" style={{ background: 'var(--surface)' }}>Pause all</Button>
        </div>
      </div>

      <OrgTabBar active="live" />
    </PhoneShell>
  );
};

/* ============== 03. SCORE OVERRIDE / DISPUTE ============== */
const MobileOrgOverride = () => (
  <PhoneShell statusBg="var(--rose-100)">
    <ScreenHeader title="Resolve dispute" sub="Court 3 · Group A · Round 2" withBack />

    <div style={{ flex: 1, overflow: 'hidden', padding: '8px 20px 110px' }}>
      {/* Context */}
      <div style={{
        padding: 14, marginBottom: 16, borderRadius: 'var(--r-xl)',
        background: 'var(--rose-100)', border: '1px solid var(--rose-200)',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--rose-400)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="info" size={20} color="#FFFFFF" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rose-600)' }}>Both teams disagree on Game 2</div>
          <div style={{ fontSize: 12, color: 'var(--ink-600)', marginTop: 3, lineHeight: 1.4 }}>
            Aanya submitted 21–19. Lila submitted 19–21. Your call settles it.
          </div>
        </div>
      </div>

      {/* Submitted versions */}
      <h3 className="uac-display" style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>What each team submitted</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {[
          { who: 'Aanya & Marcus', when: '4 min ago', g1: '21–18', g2: '21–19', g3: '—', mine: true },
          { who: 'Lila & Jonas',   when: '3 min ago', g1: '21–18', g2: '19–21', g3: '—', mine: false },
        ].map((row, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto',
            alignItems: 'center', gap: 12, padding: '12px 14px',
            background: 'var(--surface)', border: '1px solid var(--border-soft)',
            borderRadius: 'var(--r-md)',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{row.who}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-500)' }}>{row.when}</div>
            </div>
            <span className="uac-num" style={{ fontSize: 13, color: 'var(--ink-700)' }}>{row.g1}</span>
            <span className="uac-num" style={{
              fontSize: 13, fontWeight: 800,
              color: 'var(--rose-600)',
              background: 'var(--rose-100)', padding: '3px 6px', borderRadius: 4,
            }}>{row.g2}</span>
            <span className="uac-num" style={{ fontSize: 13, color: 'var(--ink-400)' }}>{row.g3}</span>
          </div>
        ))}
      </div>

      {/* Override form */}
      <h3 className="uac-display" style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Your final ruling</h3>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', padding: 16, border: '1.5px solid var(--court-300)' }}>
        {['Game 1','Game 2 · disputed','Game 3'].map((g, i) => (
          <div key={g} style={{
            display: 'grid', gridTemplateColumns: '90px 1fr 16px 1fr',
            alignItems: 'center', padding: '12px 0',
            borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)',
            opacity: i === 2 ? 0.5 : 1,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: i === 1 ? 'var(--rose-600)' : 'var(--ink-500)' }}>{g}</span>
            <Stepper value={i === 2 ? 0 : 21} />
            <span style={{ textAlign: 'center', color: 'var(--ink-400)', fontWeight: 700 }}>–</span>
            <Stepper value={i === 2 ? 0 : [18, 19][i]} />
          </div>
        ))}

        {/* Reason */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Reason (logged)</label>
          <div style={{
            marginTop: 6, padding: '10px 12px', background: 'var(--ink-50)',
            borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--ink-700)',
            border: '1px solid var(--border-soft)',
          }}>
            Reviewed line-judge log — Aanya's score stands.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 12, background: 'var(--court-100)', border: '1px solid var(--court-200)', borderRadius: 'var(--r-md)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon name="info" size={16} color="var(--court-700)" />
        <div style={{ fontSize: 11, color: 'var(--court-900)', lineHeight: 1.45 }}>
          Both teams get a push when you confirm. Override is logged with your name and timestamp.
        </div>
      </div>
    </div>

    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 20px 28px', background: 'var(--surface-glass)',
      backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border-soft)',
      display: 'flex', gap: 10,
    }}>
      <Button variant="ghost" size="lg" style={{ flex: 1 }}>Replay</Button>
      <Button variant="primaryBold" size="lg" style={{ flex: 2 }} icon={<Icon name="check" size={18} color="#FFF" strokeWidth={3} />}>Confirm ruling</Button>
    </div>
  </PhoneShell>
);

/* ============== 04. BROADCAST / PUSH COMPOSER ============== */
const MobileOrgBroadcast = () => (
  <PhoneShell>
    <ScreenHeader
      title="Broadcast"
      sub="Friday Night Smash · 64 players"
      withBack
    />

    <div style={{ flex: 1, overflow: 'hidden', padding: '8px 20px 130px' }}>
      {/* Audience */}
      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-500)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Who hears it</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip variant="dark" size="sm" icon={<Icon name="users" size={11} />}>Everyone (64)</Chip>
        <Chip variant="default" size="sm">Group A only</Chip>
        <Chip variant="default" size="sm">Court 3</Chip>
        <Chip variant="default" size="sm">Volunteers</Chip>
      </div>

      {/* Template picker */}
      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-500)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Quick template</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, marginBottom: 18 }}>
        {[
          { ic: 'clock',  label: 'Delay 10 min',   bg: 'var(--peach-100)',    fg: 'var(--peach-600)' },
          { ic: 'check',  label: 'Round complete', bg: 'var(--mint-100)',     fg: 'var(--mint-600)' },
          { ic: 'racket', label: 'Take the court', bg: 'var(--court-100)',    fg: 'var(--court-700)', active: true },
          { ic: 'trophy', label: 'Winners up',     bg: 'var(--gold-200)',     fg: 'var(--gold-600)' },
        ].map(t => (
          <div key={t.label} style={{
            background: t.bg, padding: '12px 14px', borderRadius: 'var(--r-md)',
            display: 'flex', alignItems: 'center', gap: 10,
            border: t.active ? '2px solid var(--court-500)' : '2px solid transparent',
          }}>
            <Icon name={t.ic} size={18} color={t.fg} />
            <span style={{ fontSize: 12, fontWeight: 700, color: t.fg }}>{t.label}</span>
          </div>
        ))}
      </div>

      {/* Message */}
      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-500)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Message</label>
      <div style={{
        marginTop: 8, padding: 14, background: 'var(--surface)',
        border: '1.5px solid var(--court-300)', borderRadius: 'var(--r-md)',
        minHeight: 90,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 6 }}>
          Round 3 — take the court
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.5 }}>
          Group A on courts 1 &amp; 2, Group B on 3 &amp; 4. First serves at 8:15 PM. Check your bracket for opponents.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--ink-500)' }}>
        <span>{`{tournament}, {round}, {court} available`}</span>
        <span className="uac-num">142 / 240</span>
      </div>

      {/* Preview */}
      <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-500)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'block', marginTop: 18 }}>Preview on lock screen</label>
      <div style={{
        marginTop: 8, padding: 14, borderRadius: 'var(--r-xl)',
        background: 'linear-gradient(180deg, #2A2342 0%, #1A1B30 100%)',
        boxShadow: '0 12px 28px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.95)', borderRadius: 'var(--r-md)',
          padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--court-400)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <LogoMark size={18} color="#FFFFFF" accent="rgba(255,255,255,0.7)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-700)' }}>C U at Court</span>
              <span style={{ fontSize: 10, color: 'var(--ink-500)' }}>now</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)', marginTop: 2 }}>Round 3 — take the court</div>
            <div style={{ fontSize: 12, color: 'var(--ink-700)', marginTop: 1, lineHeight: 1.4 }}>
              Group A on courts 1 &amp; 2, Group B on 3 &amp; 4. First serves at 8:15 PM…
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '14px 20px 28px', background: 'var(--surface-glass)',
      backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border-soft)',
      display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <button style={{
        width: 48, height: 48, borderRadius: 12, background: 'var(--surface)',
        border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="clock" size={18} color="var(--ink-700)" />
      </button>
      <Button variant="primaryBold" size="lg" style={{ flex: 1 }} icon={<Icon name="bell" size={18} color="#FFF" />}>Send to 64</Button>
    </div>
  </PhoneShell>
);

/* ============== 05. CHECK-IN / ROSTER ============== */
const MobileOrgCheckIn = () => {
  const players = [
    { name: 'Aanya Patel',    team: 'Aanya & Marcus', status: 'in',     time: '6:42 PM' },
    { name: 'Marcus Tan',     team: 'Aanya & Marcus', status: 'in',     time: '6:42 PM' },
    { name: 'Priya Iyer',     team: 'Priya & Daniel', status: 'in',     time: '6:45 PM' },
    { name: 'Daniel Cho',     team: 'Priya & Daniel', status: 'in',     time: '6:48 PM' },
    { name: 'Lila Okonkwo',   team: 'Lila & Jonas',   status: 'in',     time: '6:51 PM' },
    { name: 'Jonas Berg',     team: 'Lila & Jonas',   status: 'late',   time: 'no show yet' },
    { name: 'Mei Wong',       team: 'Mei & Ravi',     status: 'waitlist', time: 'standby' },
    { name: 'Ravi Singh',     team: 'Mei & Ravi',     status: 'waitlist', time: 'standby' },
  ];

  const statusCfg = {
    in:       { bg: 'var(--mint-200)',     fg: 'var(--mint-600)',     ic: 'check', label: 'In' },
    late:     { bg: 'var(--peach-200)',    fg: 'var(--peach-600)',    ic: 'clock', label: 'Late' },
    waitlist: { bg: 'var(--ink-100)',      fg: 'var(--ink-600)',      ic: 'user',  label: 'Standby' },
  };

  return (
    <PhoneShell statusBg="var(--mint-200)">
      {/* Scanner hero */}
      <div style={{
        padding: '14px 20px 24px',
        background: 'linear-gradient(135deg, var(--mint-200), var(--mint-400))',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.4)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrowLeft" size={18} />
          </button>
          <div className="uac-display" style={{ fontSize: 18, fontWeight: 600 }}>Check-in</div>
          <button style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.4)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" size={18} />
          </button>
        </div>

        {/* Big scan button */}
        <div style={{
          background: 'rgba(255,255,255,0.5)', borderRadius: 'var(--r-xl)',
          padding: 16, display: 'flex', alignItems: 'center', gap: 14,
          border: '1.5px dashed var(--mint-600)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'var(--ink-900)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="grid" size={28} color="#FFFFFF" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="uac-display" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>Scan a QR</div>
            <div style={{ fontSize: 12, color: 'var(--mint-600)', fontWeight: 600 }}>Players show theirs on Profile</div>
          </div>
          <Icon name="chevron" size={18} color="var(--ink-700)" />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '14px 20px 110px' }}>
        {/* Counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          <div style={{ padding: 10, background: 'var(--mint-100)', border: '1px solid var(--mint-200)', borderRadius: 'var(--r-md)' }}>
            <div className="uac-display" style={{ fontSize: 20, fontWeight: 600, color: 'var(--mint-600)' }}>58</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mint-600)', letterSpacing: '0.06em' }}>CHECKED IN</div>
          </div>
          <div style={{ padding: 10, background: 'var(--peach-100)', border: '1px solid var(--peach-200)', borderRadius: 'var(--r-md)' }}>
            <div className="uac-display" style={{ fontSize: 20, fontWeight: 600, color: 'var(--peach-600)' }}>4</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--peach-600)', letterSpacing: '0.06em' }}>LATE</div>
          </div>
          <div style={{ padding: 10, background: 'var(--ink-50)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-md)' }}>
            <div className="uac-display" style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-700)' }}>2</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.06em' }}>STANDBY</div>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflow: 'hidden' }}>
          <Chip variant="dark" size="sm">All 64</Chip>
          <Chip variant="default" size="sm">Late</Chip>
          <Chip variant="default" size="sm">Standby</Chip>
          <Chip variant="default" size="sm">Group A</Chip>
        </div>

        {/* Roster */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
          {players.map((p, i) => {
            const s = statusCfg[p.status];
            return (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none',
              }}>
                <Avatar name={p.name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{p.team} · {p.time}</div>
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', background: s.bg, color: s.fg,
                  borderRadius: 999, fontSize: 11, fontWeight: 800,
                }}>
                  <Icon name={s.ic} size={11} color={s.fg} strokeWidth={2.5} />
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <OrgTabBar active="roster" />
    </PhoneShell>
  );
};

Object.assign(window, {
  OrgTabBar, OrgRunningCard,
  MobileOrgOverview, MobileOrgLiveMonitor,
  MobileOrgOverride, MobileOrgBroadcast, MobileOrgCheckIn,
});
