// =====================================================
// Marketing landing page (desktop web)
// =====================================================

const Landing = () => (
  <div style={{
    width: 1280, fontFamily: 'var(--font-ui)', color: 'var(--ink-900)',
    background: 'var(--surface)', overflow: 'hidden',
  }}>
    {/* Nav */}
    <nav style={{
      position: 'sticky', top: 0, zIndex: 5,
      padding: '18px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: 'rgba(255,255,255,0.84)', backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-soft)',
    }}>
      <Logo size={18} />
      <div style={{ display: 'flex', gap: 28, fontSize: 14, fontWeight: 600, color: 'var(--ink-600)' }}>
        <span>Play</span><span>Tournaments</span><span>Clubs</span><span>For organizers</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" size="sm">Sign in</Button>
        <Button variant="primaryBold" size="sm">Open app</Button>
      </div>
    </nav>

    {/* Hero */}
    <section style={{
      padding: '72px 48px 56px', position: 'relative',
      background: 'radial-gradient(80% 60% at 80% 0%, var(--lavender-100) 0%, transparent 60%), radial-gradient(60% 80% at 0% 40%, var(--court-100) 0%, transparent 60%)',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', right: -60, top: 40, opacity: 0.16 }}>
        <Shuttle size={420} />
      </div>
      <div style={{ maxWidth: 700, position: 'relative' }}>
        <Chip variant="court" icon={<Icon name="shuttle" size={12} />}>Built for badminton clubs · in beta</Chip>
        <h1 className="uac-display" style={{
          margin: '20px 0 16px', fontSize: 76, lineHeight: 0.98, fontWeight: 600,
          letterSpacing: '-0.035em',
        }}>
          Make your play <span style={{
            background: 'linear-gradient(135deg, var(--court-500) 0%, var(--lavender-500) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>count.</span>
        </h1>
        <p style={{ margin: 0, fontSize: 19, color: 'var(--ink-600)', lineHeight: 1.5, maxWidth: 560 }}>
          Drop-in nights, club leagues, and full-on tournaments — all run from the sideline. No spreadsheets. No group chats. No missed games.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
          <Button variant="primaryBold" size="lg" iconRight={<Icon name="arrow" size={16} color="#FFF" />}>Start a tournament</Button>
          <Button variant="ghost" size="lg" icon={<Icon name="play" size={16} />}>Watch a 60-sec demo</Button>
        </div>

        {/* Trust strip */}
        <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 28 }}>
          <AvatarStack names={['Aanya P.','Marcus T.','Priya I.','Daniel C.','Lila O.','Jonas B.']} size={32} max={5} />
          <div style={{ fontSize: 13, color: 'var(--ink-600)' }}>
            <strong style={{ color: 'var(--ink-900)' }}>1,800+ players</strong> across <strong style={{ color: 'var(--ink-900)' }}>32 clubs</strong> — and counting.
          </div>
        </div>
      </div>
    </section>

    {/* App preview rail */}
    <section style={{ padding: '0 48px 80px', position: 'relative' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--court-100) 0%, var(--lavender-100) 50%, var(--mint-100) 100%)',
        borderRadius: 'var(--r-3xl)', padding: '56px 48px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
          <div style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--court-700)', letterSpacing: '0.12em', marginBottom: 12 }}>THE APP</div>
            <h2 className="uac-display" style={{ margin: 0, fontSize: 40, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.05 }}>
              Designed for the sideline.
            </h2>
            <p style={{ marginTop: 12, fontSize: 16, color: 'var(--ink-600)' }}>
              Standings update live. Score entry takes ten seconds. Brackets render on a phone without pinch-zoom acrobatics.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Chip variant="dark" icon={<Icon name="check" size={12} />}>Live scoring</Chip>
            <Chip variant="dark" icon={<Icon name="check" size={12} />}>Smart seeding</Chip>
            <Chip variant="dark" icon={<Icon name="check" size={12} />}>Magic-link login</Chip>
          </div>
        </div>

        {/* Mini phone mocks */}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-end' }}>
          {[
            { tone: 'court', label: 'Home', body: 'home' },
            { tone: 'lavender', label: 'Standings', body: 'standings' },
            { tone: 'mint', label: 'Match', body: 'match' },
          ].map((m, i) => (
            <div key={m.label} style={{
              width: 220, transform: i === 1 ? 'translateY(-20px)' : 'none',
              filter: i === 1 ? 'drop-shadow(0 30px 60px rgba(31,107,170,0.25))' : 'drop-shadow(0 18px 36px rgba(31,107,170,0.15))',
            }}>
              <div style={{
                background: 'var(--surface)', borderRadius: 28,
                border: '6px solid var(--ink-900)', overflow: 'hidden',
                aspectRatio: '0.46', display: 'flex', flexDirection: 'column',
              }}>
                {m.body === 'home' && <MiniHome />}
                {m.body === 'standings' && <MiniStandings />}
                {m.body === 'match' && <MiniMatch />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Features */}
    <section style={{ padding: '0 48px 80px' }}>
      <h2 className="uac-display" style={{ margin: '0 0 8px', fontSize: 36, fontWeight: 600, letterSpacing: '-0.025em', textAlign: 'center' }}>
        Three apps in one
      </h2>
      <p style={{ margin: '0 auto 40px', fontSize: 16, color: 'var(--ink-500)', textAlign: 'center', maxWidth: 520 }}>
        Whether you're casual, competitive, or running the whole show — C U At Court has you.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          {
            tone: 'court', tint: 'var(--court-100)', bd: 'var(--court-200)', icHex: 'var(--court-700)',
            ic: 'users', kicker: 'For social play',
            title: 'See who\'s in tonight',
            text: 'Drop-in night reminders, partner pairings, and a friendly "I\'m heading over" tap. The court chat without the WhatsApp chaos.',
          },
          {
            tone: 'lavender', tint: 'var(--lavender-100)', bd: 'var(--lavender-200)', icHex: 'var(--lavender-700)',
            ic: 'trophy', kicker: 'For competitive players',
            title: 'A tournament in your pocket',
            text: 'Browse open tournaments, register with a partner, submit scores court-side, and follow the bracket as it unfolds.',
          },
          {
            tone: 'peach', tint: 'var(--peach-100)', bd: 'var(--peach-200)', icHex: 'var(--peach-600)',
            ic: 'settings', kicker: 'For organizers',
            title: 'Run it without spreadsheets',
            text: 'Build a tournament in 90 seconds. Auto-seed brackets, override scores, and push updates to every player\'s phone instantly.',
          },
        ].map(f => (
          <div key={f.title} style={{
            background: f.tint, border: `1px solid ${f.bd}`,
            borderRadius: 'var(--r-2xl)', padding: 28, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 18,
              background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={f.ic} size={22} color={f.icHex} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: f.icHex, textTransform: 'uppercase', marginBottom: 8 }}>{f.kicker}</div>
            <h3 className="uac-display" style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>{f.title}</h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-600)', lineHeight: 1.55 }}>{f.text}</p>
          </div>
        ))}
      </div>
    </section>

    {/* Testimonial */}
    <section style={{ padding: '0 48px 80px' }}>
      <div style={{
        background: 'var(--ink-900)', color: '#FFFFFF',
        borderRadius: 'var(--r-3xl)', padding: '56px 48px',
        display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48, alignItems: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -50, bottom: -60, opacity: 0.12 }}>
          <LogoMark size={320} color="#7BC3FF" accent="#A98AE0" />
        </div>
        <div style={{ position: 'relative' }}>
          <Icon name="star" size={24} color="var(--gold-400)" />
          <div className="uac-display" style={{
            marginTop: 16, fontSize: 28, fontWeight: 500, lineHeight: 1.3, letterSpacing: '-0.015em',
          }}>
            "We ran three nights and a 32-player open with zero scoring disputes. The live bracket on the wall TV was the best part — felt like a real event."
          </div>
          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name="Priya Iyer" size={48} />
            <div>
              <div style={{ fontWeight: 700 }}>Priya Iyer</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Organizer · Riverside Sports Centre</div>
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { v: '4 min', l: 'to set up a tournament' },
            { v: '<10 s', l: 'to enter a score' },
            { v: '0', l: 'spreadsheets harmed' },
            { v: '1,800+', l: 'players this season' },
          ].map(s => (
            <div key={s.l} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--r-md)', padding: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="uac-display" style={{ fontSize: 28, fontWeight: 600 }}>{s.v}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section style={{ padding: '0 48px 80px' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--court-300) 0%, var(--lavender-300) 100%)',
        borderRadius: 'var(--r-3xl)', padding: '56px 48px',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', left: -40, top: -20, opacity: 0.3 }}>
          <Shuttle size={200} color="#FFFFFF" tip="rgba(255,255,255,0.7)" />
        </div>
        <div style={{ position: 'absolute', right: -40, bottom: -20, opacity: 0.3, transform: 'rotate(180deg)' }}>
          <Shuttle size={200} color="#FFFFFF" tip="rgba(255,255,255,0.7)" />
        </div>
        <div style={{ position: 'relative' }}>
          <h2 className="uac-display" style={{ margin: '0 0 16px', fontSize: 48, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1 }}>
            See you at the court.
          </h2>
          <p style={{ margin: '0 auto 28px', fontSize: 17, color: 'var(--ink-700)', maxWidth: 480 }}>
            Free for casual play. Pay only when your tournament grows past 32 players.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button variant="dark" size="lg">Start free</Button>
            <Button variant="ghost" size="lg" style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)' }}>Talk to us</Button>
          </div>
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer style={{ padding: '40px 48px 48px', borderTop: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Logo size={16} />
      <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>© 2026 C U At Court · Built for clubs, courts, and Friday nights.</div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, fontWeight: 600, color: 'var(--ink-500)' }}>
        <span>Privacy</span><span>Terms</span><span>Contact</span>
      </div>
    </footer>
  </div>
);

/* ---------- Mini phone bodies for the hero rail ---------- */
const MiniHome = () => (
  <div style={{ flex: 1, padding: 10, background: 'var(--bg-app)', fontSize: 9 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div className="uac-display" style={{ fontSize: 12, fontWeight: 700 }}>Hi, Aanya</div>
      <Avatar name="Aanya Patel" size={18} />
    </div>
    <div style={{ background: 'var(--ink-900)', color: '#FFF', borderRadius: 8, padding: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 7, color: '#7BC3FF', fontWeight: 800, letterSpacing: '0.1em' }}>TONIGHT</div>
      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>Friday Night Smash</div>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)' }}>7:00 PM · Riverside</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
      {['plus','search','trophy','users'].map((ic, i) => (
        <div key={i} style={{ aspectRatio: '1/1', background: ['var(--court-100)','var(--lavender-100)','var(--mint-100)','var(--peach-100)'][i], borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ic} size={11} />
        </div>
      ))}
    </div>
  </div>
);

const MiniStandings = () => (
  <div style={{ flex: 1, padding: 10, background: 'var(--bg-app)' }}>
    <div className="uac-display" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Group A</div>
    <div style={{ fontSize: 7, color: 'var(--ink-500)', marginBottom: 8 }}>Live · 3 matches left</div>
    <div style={{ background: 'var(--surface)', borderRadius: 6 }}>
      {STANDINGS.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none' }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: i === 0 ? 'var(--gold-200)' : 'var(--ink-50)', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.rank}</span>
          <span style={{ fontSize: 8, fontWeight: 700, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.team.name}</span>
          <span style={{ fontSize: 9, fontWeight: 800 }}>{r.pts}</span>
        </div>
      ))}
    </div>
  </div>
);

const MiniMatch = () => (
  <div style={{ flex: 1, padding: 10, background: 'var(--bg-app)' }}>
    <div className="uac-display" style={{ fontSize: 11, fontWeight: 700 }}>Submit score</div>
    <div style={{ fontSize: 7, color: 'var(--ink-500)', marginBottom: 8 }}>Court 3 · Round 2</div>
    <div style={{ background: 'var(--court-100)', borderRadius: 6, padding: 8, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 8, fontWeight: 700 }}>A&M</span>
      <span className="uac-display" style={{ fontSize: 10, color: 'var(--court-700)' }}>vs</span>
      <span style={{ fontSize: 8, fontWeight: 700 }}>L&J</span>
    </div>
    {['G1','G2','G3'].map((g, i) => (
      <div key={g} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none' }}>
        <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--ink-500)' }}>{g}</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span className="uac-num" style={{ fontSize: 11, fontWeight: 800 }}>{[21,19,0][i]}</span>
          <span style={{ fontSize: 8, color: 'var(--ink-400)' }}>–</span>
          <span className="uac-num" style={{ fontSize: 11, fontWeight: 800 }}>{[18,21,0][i]}</span>
        </div>
      </div>
    ))}
  </div>
);

Object.assign(window, { Landing });
