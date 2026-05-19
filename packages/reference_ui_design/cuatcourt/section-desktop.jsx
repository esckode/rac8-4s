// =====================================================
// Desktop / Organizer screens
// 1280 × 800
// =====================================================

const DESKTOP_W = 1280;
const DESKTOP_H = 820;

const DesktopShell = ({ children, sidebar = true, active = 'tournaments' }) => (
  <div style={{
    width: DESKTOP_W, height: DESKTOP_H, background: 'var(--surface-tint)',
    fontFamily: 'var(--font-ui)', color: 'var(--ink-900)',
    display: 'flex', overflow: 'hidden',
  }}>
    {sidebar && <DesktopSidebar active={active} />}
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {children}
    </div>
  </div>
);

const DesktopSidebar = ({ active }) => {
  const nav = [
    { id: 'dash', label: 'Dashboard', icon: 'home' },
    { id: 'tournaments', label: 'Tournaments', icon: 'trophy' },
    { id: 'players', label: 'Players', icon: 'users' },
    { id: 'venues', label: 'Venues', icon: 'pin' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar' },
  ];
  return (
    <aside style={{
      width: 240, background: 'var(--surface)',
      borderRight: '1px solid var(--border-soft)',
      padding: '20px 14px', display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      <div style={{ padding: '0 8px 20px' }}>
        <Logo size={18} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav.map(n => (
          <div key={n.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            borderRadius: 'var(--r-md)', cursor: 'pointer',
            background: active === n.id ? 'var(--court-100)' : 'transparent',
            color: active === n.id ? 'var(--court-700)' : 'var(--ink-600)',
            fontWeight: active === n.id ? 700 : 500, fontSize: 13.5,
          }}>
            <Icon name={n.icon} size={18} />
            {n.label}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: '0 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink-400)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Workspace</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {[
          { c: 'var(--court-300)', n: 'Riverside SC' },
          { c: 'var(--lavender-300)', n: 'Eastside Smash' },
          { c: 'var(--mint-200)', n: 'Greenwood BC' },
        ].map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderRadius: 'var(--r-md)', cursor: 'pointer',
            background: i === 0 ? 'var(--ink-50)' : 'transparent', fontSize: 13,
          }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: c.c }} />
            <span style={{ fontWeight: i === 0 ? 700 : 500 }}>{c.n}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'auto', padding: 12, background: 'var(--surface-sunken)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name="Aanya Patel" size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Aanya Patel</div>
          <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>Organizer</div>
        </div>
        <Icon name="moreH" size={16} color="var(--ink-400)" />
      </div>
    </aside>
  );
};

const DesktopHeader = ({ title, sub, actions, breadcrumbs }) => (
  <header style={{
    padding: '20px 32px', background: 'var(--surface)',
    borderBottom: '1px solid var(--border-soft)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }}>
    <div>
      {breadcrumbs && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, color: 'var(--ink-500)' }}>
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              <span style={{ fontWeight: i === breadcrumbs.length - 1 ? 700 : 500, color: i === breadcrumbs.length - 1 ? 'var(--ink-700)' : 'var(--ink-500)' }}>{b}</span>
              {i < breadcrumbs.length - 1 && <Icon name="chevron" size={12} color="var(--ink-300)" />}
            </React.Fragment>
          ))}
        </div>
      )}
      <h1 className="uac-display" style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h1>
      {sub && <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>{sub}</div>}
    </div>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      {actions}
    </div>
  </header>
);

/* ============== 01. ORGANIZER DASHBOARD ============== */
const DesktopDashboard = () => (
  <DesktopShell active="tournaments">
    <DesktopHeader
      title="Tournaments"
      sub="Riverside SC · 4 active, 2 drafts"
      actions={(
        <>
          <button style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Icon name="bell" size={18} />
            <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, background: 'var(--rose-400)', borderRadius: '50%' }} />
          </button>
          <Button variant="primaryBold" icon={<Icon name="plus" size={16} color="#FFF" />}>New tournament</Button>
        </>
      )}
    />
    <div style={{ flex: 1, overflow: 'hidden', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { l: 'Active tournaments', v: '4', delta: '+1', tone: 'court', ic: 'trophy' },
          { l: 'Players this month', v: '186', delta: '+24', tone: 'lavender', ic: 'users' },
          { l: 'Matches played', v: '92', delta: '+15', tone: 'mint', ic: 'shuttle' },
          { l: 'Avg fill rate', v: '88%', delta: '+4%', tone: 'peach', ic: 'bolt' },
        ].map(k => (
          <div key={k.l} style={{
            background: 'var(--surface)', border: '1px solid var(--border-soft)',
            borderRadius: 'var(--r-xl)', padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `var(--${k.tone}-100)`,
                color: `var(--${k.tone}-${k.tone === 'mint' ? '600' : (k.tone === 'peach' ? '600' : '700')})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name={k.ic} size={18} /></div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'var(--mint-100)', color: 'var(--mint-600)' }}>{k.delta}</span>
            </div>
            <div className="uac-display" style={{ fontSize: 28, fontWeight: 600 }}>{k.v}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{k.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, flex: 1, minHeight: 0 }}>
        {/* Tournament list */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-soft)' }}>
            <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your tournaments</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <Chip variant="dark" size="sm">All</Chip>
              <Chip variant="default" size="sm">Active</Chip>
              <Chip variant="default" size="sm">Drafts</Chip>
              <Chip variant="default" size="sm">Past</Chip>
            </div>
          </div>
          {TOURNAMENTS.map((t, i) => (
            <div key={t.id} style={{
              padding: '14px 20px', display: 'grid',
              gridTemplateColumns: '1fr 110px 130px 110px 100px', alignItems: 'center', gap: 14,
              borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `var(--${t.cover === 'gold' ? 'gold' : (t.cover === 'peach' ? 'peach' : (t.cover === 'mint' ? 'mint' : (t.cover === 'lavender' ? 'lavender' : 'court')))}-200)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Shuttle size={26} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{t.sport}</div>
                </div>
              </div>
              <PhaseBadge phase={t.phase} size="sm" />
              <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{t.date}</span>
              <div>
                <div style={{ height: 5, background: 'var(--ink-50)', borderRadius: 999, overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{ width: `${(t.players / t.capacity) * 100}%`, height: '100%', background: 'var(--court-400)' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>{t.players}/{t.capacity}</span>
              </div>
              <Button size="sm" variant="ghost" iconRight={<Icon name="chevron" size={14} />}>Manage</Button>
            </div>
          ))}
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          {/* Activity */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border-soft)', padding: 18, flex: 1, overflow: 'hidden' }}>
            <h3 className="uac-display" style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Live activity</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { c: 'mint', text: <><b>Aanya & Marcus</b> beat Mei & Ravi 2-0</>, when: 'just now' },
                { c: 'court', text: <><b>Jamie</b> registered for Spring Singles Cup</>, when: '3m' },
                { c: 'lavender', text: <>Bracket published for <b>Knockout Friday</b></>, when: '12m' },
                { c: 'peach', text: <>Group A standings recalculated</>, when: '18m' },
              ].map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${a.c}-400)`, marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div>{a.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div style={{ background: 'linear-gradient(135deg, var(--court-100) 0%, var(--lavender-100) 100%)', borderRadius: 'var(--r-xl)', padding: 18 }}>
            <h3 className="uac-display" style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600 }}>Tonight at 7 PM</h3>
            <div style={{ fontSize: 13, color: 'var(--ink-600)', marginBottom: 12 }}>16 teams arriving · Courts 1-6 booked</div>
            <Button variant="dark" size="sm">Open live monitor</Button>
          </div>
        </div>
      </div>
    </div>
  </DesktopShell>
);

/* ============== 02. CREATE TOURNAMENT WIZARD ============== */
const DesktopCreateTournament = () => {
  const steps = ['Basics','Format','Schedule','Players','Review'];
  const current = 1;
  return (
    <DesktopShell active="tournaments">
      <DesktopHeader
        title="New tournament"
        breadcrumbs={['Tournaments','New tournament']}
        actions={(
          <>
            <Button variant="ghost">Save draft</Button>
            <Button variant="primaryBold" iconRight={<Icon name="arrow" size={16} color="#FFF" />}>Continue</Button>
          </>
        )}
      />
      <div style={{ flex: 1, overflow: 'hidden', padding: 32, display: 'grid', gridTemplateColumns: '220px 1fr 320px', gap: 24 }}>
        {/* Steps */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', letterSpacing: '0.1em', marginBottom: 12 }}>SETUP</div>
          {steps.map((s, i) => (
            <div key={s} style={{ display: 'flex', gap: 12, padding: '10px 0', alignItems: 'center' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: i < current ? 'var(--mint-200)' : (i === current ? 'var(--court-400)' : 'var(--ink-50)'),
                color: i < current ? 'var(--mint-600)' : (i === current ? 'var(--ink-900)' : 'var(--ink-500)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
              }}>{i < current ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}</div>
              <span style={{ fontSize: 14, fontWeight: i === current ? 700 : 500, color: i === current ? 'var(--ink-900)' : 'var(--ink-500)' }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-2xl)', border: '1px solid var(--border-soft)', padding: 32, overflow: 'hidden' }}>
          <h2 className="uac-display" style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 600 }}>Format</h2>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--ink-500)' }}>How is this tournament structured? You can change these later, before play begins.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Match type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { l: 'Singles', sel: false, sub: '1 vs 1' },
                  { l: 'Doubles', sel: true, sub: '2 vs 2' },
                  { l: 'Mixed', sel: false, sub: '2 vs 2 · m+f' },
                ].map(o => (
                  <div key={o.l} style={{
                    padding: 14, borderRadius: 'var(--r-md)',
                    border: o.sel ? '2px solid var(--court-400)' : '1.5px solid var(--border)',
                    background: o.sel ? 'var(--court-50)' : 'var(--surface)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{o.l}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{o.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Structure</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { l: 'Group → Knockout', sel: true, sub: 'Round robin groups, top advance' },
                  { l: 'Knockout only', sel: false, sub: 'Single elimination bracket' },
                  { l: 'Round robin', sel: false, sub: 'Everyone plays everyone' },
                ].map(o => (
                  <div key={o.l} style={{
                    padding: 14, borderRadius: 'var(--r-md)',
                    border: o.sel ? '2px solid var(--court-400)' : '1.5px solid var(--border)',
                    background: o.sel ? 'var(--court-50)' : 'var(--surface)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{o.l}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{o.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Game format">
                <Segmented options={['Best of 3','Best of 5']} selected={0} />
              </Field>
              <Field label="Points per game">
                <Select value="21 points" />
              </Field>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Tie-breakers (drag to reorder)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['Head-to-head record','Set difference','Points scored','Random draw'].map((t, i) => (
                  <div key={t} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'var(--surface-sunken)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)',
                  }}>
                    <Icon name="menu" size={14} color="var(--ink-400)" />
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--court-100)', color: 'var(--court-700)', fontWeight: 800, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i+1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink-400)', letterSpacing: '0.1em', marginBottom: 12 }}>PREVIEW</div>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--court-200), var(--court-300))', padding: 16, position: 'relative', height: 100, overflow: 'hidden' }}>
              <PhaseBadge phase="draft" size="sm" />
              <div style={{ position: 'absolute', right: -10, bottom: -10, opacity: 0.4 }}>
                <Shuttle size={80} color="rgba(255,255,255,0.9)" />
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div className="uac-display" style={{ fontSize: 17, fontWeight: 600 }}>New tournament</div>
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>Badminton · Doubles</div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip variant="court" size="sm">Group → KO</Chip>
                <Chip variant="default" size="sm">Best of 3</Chip>
                <Chip variant="default" size="sm">21 pts</Chip>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: 14, background: 'var(--lavender-100)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--lavender-700)', lineHeight: 1.5 }}>
            <strong>Tip:</strong> Doubles tournaments need an even number of teams per group. We'll suggest groupings on the next step.
          </div>
        </div>
      </div>
    </DesktopShell>
  );
};

/* ============== 03. BRACKET REVIEW ============== */
const DesktopBracketReview = () => (
  <DesktopShell active="tournaments">
    <DesktopHeader
      title="Knockout Friday"
      breadcrumbs={['Tournaments','Knockout Friday','Generate bracket']}
      actions={(
        <>
          <Button variant="ghost" icon={<Icon name="edit" size={16} />}>Edit seeding</Button>
          <Button variant="ghost">Regenerate</Button>
          <Button variant="primaryBold" icon={<Icon name="bolt" size={16} color="#FFF" />}>Publish bracket</Button>
        </>
      )}
    />
    <div style={{ flex: 1, overflow: 'hidden', padding: 24, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
      {/* Bracket */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', padding: 24, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <h3 className="uac-display" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Single elimination · 8 teams</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>Seeded by group stage</span>
        </div>
        <BracketDiagram />
      </div>

      {/* Side panel: seeding */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', padding: 18 }}>
          <h3 className="uac-display" style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Seeding</h3>
          {[
            { seed: 1, team: TEAMS[0], pts: 9, from: 'Group A' },
            { seed: 2, team: { name: 'Wong & Park', short: 'W&P', color: 'var(--pink-300)', players: ['Wong J.', 'Park S.'] }, pts: 9, from: 'Group B' },
            { seed: 3, team: TEAMS[1], pts: 6, from: 'Group A' },
            { seed: 4, team: { name: 'Hassan & Cole', short: 'H&C', color: 'var(--court-200)', players: ['Hassan O.', 'Cole D.'] }, pts: 6, from: 'Group B' },
          ].map(s => (
            <div key={s.seed} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderTop: s.seed > 1 ? '1px solid var(--border-soft)' : 'none',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: s.seed === 1 ? 'var(--gold-200)' : 'var(--court-100)',
                color: 'var(--ink-900)', fontWeight: 800, fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>#{s.seed}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.team.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>{s.from} · {s.pts} pts</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--peach-100)', border: '1px solid var(--peach-200)', borderRadius: 'var(--r-xl)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Icon name="info" size={16} color="var(--peach-600)" />
            <strong style={{ fontSize: 13, color: 'var(--peach-600)' }}>Before publishing</strong>
          </div>
          <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: 'var(--peach-600)', lineHeight: 1.6 }}>
            <li>Players will be notified by email</li>
            <li>Seeding cannot be changed once live</li>
            <li>Bracket appears in everyone's app immediately</li>
          </ul>
        </div>
      </div>
    </div>
  </DesktopShell>
);

const BracketDiagram = () => {
  // Hand-laid 8→4→2→1 bracket
  const sf1 = { a: TEAMS[0], b: TEAMS[1], score: '2-0' };
  const sf2 = { a: { name: 'Wong & Park', short: 'W&P', color: 'var(--pink-300)' }, b: { name: 'Ali & Brooks', short: 'A&B', color: 'var(--mint-200)' }, score: '1-2' };
  const fin = { a: TEAMS[0], b: { name: 'Ali & Brooks', short: 'A&B', color: 'var(--mint-200)' }, score: '0-0' };

  const colHead = (c, label) => (
    <div style={{ fontSize: 11, fontWeight: 800, color: c, letterSpacing: '0.12em', marginBottom: 12 }}>{label}</div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 0, alignItems: 'stretch', position: 'relative' }}>
      {/* QF column */}
      <div style={{ paddingRight: 24, borderRight: '1px dashed var(--border)' }}>
        {colHead('var(--court-600)', 'QUARTERS')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {BRACKET_QF.map(m => <BracketMatch key={m.id} m={m} />)}
        </div>
      </div>
      {/* SF */}
      <div style={{ padding: '0 24px', borderRight: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {colHead('var(--lavender-500)', 'SEMIS')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 60, paddingTop: 26 }}>
          <BracketMatch m={sf1} />
          <BracketMatch m={sf2} />
        </div>
      </div>
      {/* Final */}
      <div style={{ padding: '0 24px', borderRight: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {colHead('var(--gold-600)', 'FINAL')}
        <BracketMatch m={fin} highlight />
      </div>
      {/* Champion */}
      <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {colHead('var(--gold-600)', 'CHAMPION')}
        <div style={{
          padding: 16, borderRadius: 'var(--r-md)',
          background: 'linear-gradient(135deg, var(--gold-200) 0%, var(--peach-200) 100%)',
          border: '2px solid var(--gold-400)', textAlign: 'center',
        }}>
          <Icon name="trophy" size={28} color="var(--gold-600)" />
          <div style={{ marginTop: 8, fontWeight: 700, color: 'var(--ink-500)', fontSize: 12 }}>To be decided</div>
        </div>
      </div>
    </div>
  );
};

/* ============== 04. LIVE MONITOR ============== */
const DesktopLiveMonitor = () => (
  <DesktopShell active="tournaments">
    <DesktopHeader
      title="Friday Night Smash"
      breadcrumbs={['Tournaments','Friday Night Smash','Live monitor']}
      sub={null}
      actions={(
        <>
          <LiveDot label="LIVE · 12 MATCHES" />
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 6px' }} />
          <Button variant="ghost" icon={<Icon name="edit" size={16} />}>Override score</Button>
          <Button variant="primaryBold">Advance to knockout</Button>
        </>
      )}
    />
    <div style={{ flex: 1, overflow: 'hidden', padding: 24, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
      {/* Left: groups + standings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden' }}>
        {/* Group tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
          {['Group A','Group B','Group C','Group D'].map((g, i) => (
            <div key={g} style={{
              padding: '10px 16px', borderRadius: 'var(--r-md)', fontSize: 13, fontWeight: 700,
              background: i === 0 ? 'var(--ink-900)' : 'var(--surface)',
              color: i === 0 ? '#FFF' : 'var(--ink-700)',
              border: i === 0 ? 'none' : '1px solid var(--border)', cursor: 'pointer',
            }}>{g}</div>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
          <StandingsTable rows={STANDINGS} />
        </div>

        {/* Court live grid */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Courts now</h3>
            <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>6 of 6 in use</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { c: 'Court 1', m: MATCHES[0], status: 'live' },
              { c: 'Court 3', m: MATCHES[1], status: 'completed' },
              { c: 'Court 5', m: MATCHES[2], status: 'upcoming' },
            ].map(c => (
              <div key={c.c} style={{
                background: 'var(--surface)', border: '1px solid var(--border-soft)',
                borderRadius: 'var(--r-md)', padding: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-700)' }}>{c.c}</span>
                  {c.status === 'live' && <LiveDot />}
                  {c.status === 'completed' && <Chip variant="mint" size="sm">Final</Chip>}
                  {c.status === 'upcoming' && <Chip variant="default" size="sm">Next</Chip>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: c.m.a.color, fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.m.a.short}</div>
                  <span style={{ fontWeight: 700, fontSize: 11 }}>vs</span>
                  <div style={{ width: 18, height: 18, borderRadius: 5, background: c.m.b.color, fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.m.b.short}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: live feed */}
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-xl)', border: '1px solid var(--border-soft)', padding: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 className="uac-display" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Score feed</h3>
          <LiveDot />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { who: 'Aanya', team: 'A&M', text: 'submitted 21-18 vs M&R · Game 1', when: 'just now', c: 'court' },
            { who: 'Marcus', team: 'A&M', text: 'confirmed score · standings updated', when: '2m', c: 'mint' },
            { who: 'Jamie', team: 'P&D', text: 'submitted 21-14, 21-17 · final', when: '8m', c: 'mint' },
            { who: 'Riley', team: 'L&J', text: 'is waiting on partner to confirm', when: '12m', c: 'peach' },
            { who: 'Organizer', team: '', text: 'overrode Group A standings', when: '24m', c: 'lavender' },
          ].map((a, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '12px 0',
              borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none',
            }}>
              <Avatar name={a.who} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{a.who}</strong> {a.team && <span style={{ color: 'var(--ink-500)' }}>· {a.team}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-600)', marginTop: 2 }}>{a.text}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 4 }}>{a.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </DesktopShell>
);

Object.assign(window, {
  DesktopShell, DesktopHeader, DesktopSidebar,
  DesktopDashboard, DesktopCreateTournament, DesktopBracketReview, DesktopLiveMonitor,
});
