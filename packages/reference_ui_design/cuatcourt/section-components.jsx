// =====================================================
// Components: buttons, forms, cards, lists, tournament UI
// =====================================================

const SubTitle = ({ children }) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{children}</div>
);

const CompButtons = () => (
  <div style={{ width: 1080, padding: 48, background: 'var(--surface)' }}>
    <SectionHeading eyebrow="Components" title="Buttons & chips" subtitle="Five button variants. Primary is the sky-blue from the logo; primaryBold pushes saturation for hero moments only." />

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
      <Card padding={28}>
        <SubTitle>Sizes · primary</SubTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button size="sm">Register</Button>
          <Button size="md">Register</Button>
          <Button size="lg">Register</Button>
        </div>
      </Card>
      <Card padding={28}>
        <SubTitle>Variants</SubTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="primary">Primary</Button>
          <Button variant="primaryBold">Primary Bold</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="soft">Soft</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="dark">Dark</Button>
        </div>
      </Card>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
      <Card padding={28}>
        <SubTitle>With icons</SubTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="primary" icon={<Icon name="plus" size={16} />}>New tournament</Button>
          <Button variant="secondary" iconRight={<Icon name="chevron" size={16} />}>Open bracket</Button>
          <Button variant="soft" icon={<Icon name="bolt" size={16} />}>Submit score</Button>
          <Button variant="dark" icon={<Icon name="trophy" size={16} />}>Publish</Button>
        </div>
      </Card>
      <Card padding={28}>
        <SubTitle>Icon-only</SubTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {['bell','search','filter','share','settings','moreH'].map(n => (
            <button key={n} style={{
              width: 42, height: 42, borderRadius: 'var(--r-md)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              color: 'var(--ink-700)',
            }}><Icon name={n} size={18} /></button>
          ))}
        </div>
      </Card>
    </div>

    <Card padding={28}>
      <SubTitle>Chips</SubTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Chip variant="court">Doubles</Chip>
        <Chip variant="court" icon={<Icon name="shuttle" size={12} />}>Badminton</Chip>
        <Chip variant="lavender">Mixed</Chip>
        <Chip variant="mint" icon={<Icon name="check" size={12} />}>Confirmed</Chip>
        <Chip variant="peach">Waitlist · 3</Chip>
        <Chip variant="default" icon={<Icon name="pin" size={12} />}>Riverside SC</Chip>
        <Chip variant="dark" icon={<Icon name="bolt" size={12} />}>Live</Chip>
      </div>
    </Card>
  </div>
);

const CompForms = () => (
  <div style={{ width: 1080, padding: 48, background: 'var(--surface)' }}>
    <SectionHeading eyebrow="Components" title="Forms" subtitle="Used in registration, score entry, tournament setup." />

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Inputs */}
      <Card padding={28}>
        <SubTitle>Text inputs</SubTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Tournament name">
            <Input value="Friday Night Smash" />
          </Field>
          <Field label="Partner's email" hint="They'll receive a magic link to confirm.">
            <Input value="aanya@cuatcourt.com" leadingIcon="user" />
          </Field>
          <Field label="Venue" error="Please choose a court.">
            <Input value="" placeholder="Search venues…" leadingIcon="pin" hasError />
          </Field>
        </div>
      </Card>
      {/* Select / segmented */}
      <Card padding={28}>
        <SubTitle>Segmented · select</SubTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Format">
            <Segmented options={['Singles','Doubles','Mixed']} selected={1} />
          </Field>
          <Field label="Match type">
            <Segmented options={['Best of 3','Best of 5']} selected={0} />
          </Field>
          <Field label="Sport">
            <Select value="Badminton" />
          </Field>
          <Field label="Game points">
            <Select value="21 points" />
          </Field>
        </div>
      </Card>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
      <Card padding={28}>
        <SubTitle>Toggles & checks</SubTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ToggleRow label="Public tournament" hint="Anyone can browse and register" on />
          <ToggleRow label="Allow waitlist" hint="When full, players can queue" on />
          <ToggleRow label="Auto-advance bracket" hint="When group stage completes" on={false} />
          <CheckRow label="Send reminder email 24h before" checked />
          <CheckRow label="Lock partner choice after registration" checked={false} />
        </div>
      </Card>
      <Card padding={28}>
        <SubTitle>Score entry</SubTitle>
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--r-lg)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name="Aanya Patel" size={28} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Aanya & Marcus</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600 }}>YOU</span>
          </div>
          {['Game 1','Game 2','Game 3'].map((g, i) => (
            <div key={g} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 24px 1fr', alignItems: 'center', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-soft)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-500)' }}>{g}</span>
              <Stepper value={[21,19,21][i]} />
              <span style={{ textAlign: 'center', color: 'var(--ink-400)', fontWeight: 700 }}>–</span>
              <Stepper value={[18,21,15][i]} />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Mei & Ravi</span>
            <Avatar name="Mei Lin" size={28} />
          </div>
        </div>
      </Card>
    </div>
  </div>
);

const Field = ({ label, hint, error, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-700)', marginBottom: 6 }}>{label}</label>
    {children}
    {(hint || error) && (
      <div style={{ marginTop: 6, fontSize: 12, color: error ? 'var(--rose-600)' : 'var(--ink-500)' }}>
        {error || hint}
      </div>
    )}
  </div>
);

const Input = ({ value, placeholder, leadingIcon, hasError }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    height: 44, padding: '0 14px', background: 'var(--surface)',
    border: `1.5px solid ${hasError ? 'var(--rose-400)' : 'var(--border)'}`,
    borderRadius: 'var(--r-md)',
  }}>
    {leadingIcon && <Icon name={leadingIcon} size={16} color="var(--ink-400)" />}
    <input
      defaultValue={value} placeholder={placeholder}
      style={{
        flex: 1, border: 'none', outline: 'none', background: 'transparent',
        fontSize: 14, fontFamily: 'var(--font-ui)', color: 'var(--ink-900)',
      }}
    />
  </div>
);

const Select = ({ value }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 44, padding: '0 14px', background: 'var(--surface)',
    border: '1.5px solid var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer',
  }}>
    <span style={{ fontSize: 14, fontWeight: 500 }}>{value}</span>
    <Icon name="chevronDown" size={16} color="var(--ink-400)" />
  </div>
);

const Segmented = ({ options, selected = 0 }) => (
  <div style={{
    display: 'inline-flex', background: 'var(--ink-50)', borderRadius: 'var(--r-md)',
    padding: 4, gap: 2, height: 44,
  }}>
    {options.map((o, i) => (
      <div key={o} style={{
        padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 700,
        background: i === selected ? 'var(--surface)' : 'transparent',
        color: i === selected ? 'var(--ink-900)' : 'var(--ink-500)',
        boxShadow: i === selected ? 'var(--shadow-xs)' : 'none',
        cursor: 'pointer',
      }}>{o}</div>
    ))}
  </div>
);

const ToggleRow = ({ label, hint, on }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: 14, borderBottom: '1px solid var(--border-soft)' }}>
    <div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>{hint}</div>}
    </div>
    <div style={{
      width: 42, height: 24, borderRadius: 999, padding: 2,
      background: on ? 'var(--court-400)' : 'var(--ink-200)',
      display: 'flex', alignItems: 'center', flexShrink: 0,
      transition: 'background .15s',
    }}>
      <div style={{
        width: 20, height: 20, background: '#FFFFFF', borderRadius: '50%',
        marginLeft: on ? 18 : 0, transition: 'margin .15s',
        boxShadow: 'var(--shadow-xs)',
      }} />
    </div>
  </div>
);

const CheckRow = ({ label, checked }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <div style={{
      width: 20, height: 20, borderRadius: 6,
      background: checked ? 'var(--court-400)' : 'var(--surface)',
      border: `1.5px solid ${checked ? 'var(--court-500)' : 'var(--ink-200)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && <Icon name="check" size={14} color="var(--ink-900)" strokeWidth={3} />}
    </div>
    <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
  </div>
);

const Stepper = ({ value }) => (
  <div style={{
    display: 'flex', alignItems: 'center', height: 40,
    background: 'var(--surface)', borderRadius: 'var(--r-md)',
    border: '1.5px solid var(--border)', overflow: 'hidden',
  }}>
    <button style={{ width: 32, height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-500)', fontSize: 16, fontWeight: 700 }}>−</button>
    <div className="uac-num" style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>{value}</div>
    <button style={{ width: 32, height: '100%', background: 'var(--court-100)', border: 'none', cursor: 'pointer', color: 'var(--court-700)', fontSize: 16, fontWeight: 700 }}>+</button>
  </div>
);

/* ===== TOURNAMENT-SPECIFIC COMPONENTS ===== */

const TournamentCard = ({ t, compact = false }) => {
  const covers = {
    court:    { bg: 'linear-gradient(135deg, #C9E5FF 0%, #A8D5FF 100%)', text: 'var(--ink-900)' },
    lavender: { bg: 'linear-gradient(135deg, #E0CFF7 0%, #C5AEEF 100%)', text: 'var(--ink-900)' },
    mint:     { bg: 'linear-gradient(135deg, #C6EFD6 0%, #6BCF96 100%)', text: 'var(--ink-900)' },
    peach:    { bg: 'linear-gradient(135deg, #FFDDB3 0%, #FFB35F 100%)', text: 'var(--ink-900)' },
    gold:     { bg: 'linear-gradient(135deg, #FFE8A3 0%, #F2C24A 100%)', text: 'var(--ink-900)' },
  };
  const c = covers[t.cover] || covers.court;
  const pct = Math.round((t.players / t.capacity) * 100);
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--r-2xl)',
      border: '1px solid var(--border-soft)', overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ background: c.bg, padding: compact ? 16 : 20, position: 'relative', height: compact ? 96 : 120 }}>
        <div style={{ position: 'absolute', top: compact ? 12 : 16, right: compact ? 12 : 16 }}>
          <PhaseBadge phase={t.phase} size="sm" />
        </div>
        <div style={{ position: 'absolute', bottom: -10, left: compact ? 16 : 20, opacity: 0.6 }}>
          <Shuttle size={compact ? 36 : 48} color="rgba(255,255,255,0.9)" tip="rgba(255,255,255,0.7)" />
        </div>
        <div style={{ position: 'absolute', bottom: compact ? 12 : 16, right: compact ? 12 : 20, fontSize: 12, fontWeight: 700, color: c.text, opacity: 0.75 }}>
          {t.sport}
        </div>
      </div>
      <div style={{ padding: compact ? 14 : 18 }}>
        <div className="uac-display" style={{ fontSize: compact ? 17 : 19, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 4 }}>{t.name}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="calendar" size={13} /> {t.date}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-500)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="pin" size={13} /> {t.venue}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, background: 'var(--ink-50)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--court-400)', borderRadius: 999 }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 4, fontWeight: 600 }}>{t.players}/{t.capacity} players</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StandingsTable = ({ rows, compact = false }) => {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-2xl)', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--surface-sunken)' }}>
            {['#','Team','P','W','L','Diff','Pts','Form'].map((h, i) => (
              <th key={h} style={{
                textAlign: i === 1 ? 'left' : (i === 7 ? 'left' : 'center'),
                padding: compact ? '10px 8px' : '14px 12px',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                color: 'var(--ink-500)', textTransform: 'uppercase',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.rank} style={{ borderTop: '1px solid var(--border-soft)' }}>
              <td style={{ textAlign: 'center', padding: compact ? '10px 8px' : '14px 12px' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: i === 0 ? 'var(--gold-200)' : (i === 1 ? 'var(--court-100)' : 'var(--ink-50)'),
                  color: i === 0 ? 'var(--gold-600)' : (i === 1 ? 'var(--court-700)' : 'var(--ink-600)'),
                  fontWeight: 800, fontSize: 13,
                }}>{r.rank}</div>
              </td>
              <td style={{ padding: compact ? '10px 8px' : '14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AvatarStack names={r.team.players} size={24} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{r.team.name}</span>
                </div>
              </td>
              <td className="uac-num" style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-500)' }}>{r.played}</td>
              <td className="uac-num" style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--mint-600)' }}>{r.w}</td>
              <td className="uac-num" style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-400)' }}>{r.l}</td>
              <td style={{ textAlign: 'center' }}>
                <span className="uac-num" style={{
                  display: 'inline-block', minWidth: 38, padding: '3px 8px',
                  borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: r.setDiff.startsWith('+') ? 'var(--mint-100)' : (r.setDiff === '0' ? 'var(--ink-50)' : 'var(--rose-100)'),
                  color: r.setDiff.startsWith('+') ? 'var(--mint-600)' : (r.setDiff === '0' ? 'var(--ink-500)' : 'var(--rose-600)'),
                }}>{r.setDiff}</span>
              </td>
              <td className="uac-num" style={{ textAlign: 'center', fontSize: 16, fontWeight: 800 }}>{r.pts}</td>
              <td style={{ padding: compact ? '10px 8px' : '14px 12px' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {r.form.map((f, i) => (
                    <span key={i} style={{
                      width: 18, height: 18, borderRadius: 5,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800,
                      background: f === 'W' ? 'var(--mint-200)' : 'var(--rose-100)',
                      color: f === 'W' ? 'var(--mint-600)' : 'var(--rose-600)',
                    }}>{f}</span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MatchCard = ({ m, compact = false }) => {
  const winner = m.status === 'completed' ? (m.sets.filter(s => s.a > s.b).length > m.sets.filter(s => s.b > s.a).length ? 'a' : 'b') : null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border-soft)',
      borderRadius: 'var(--r-xl)', padding: compact ? 14 : 18,
      boxShadow: 'var(--shadow-xs)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 10 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{m.round}</span>
          <span style={{ width: 3, height: 3, background: 'var(--ink-300)', borderRadius: '50%' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-500)' }}>{m.court}</span>
        </div>
        {m.status === 'live' && <LiveDot />}
        {m.status === 'upcoming' && <Chip variant="default" size="sm" icon={<Icon name="clock" size={11} />}>{m.when}</Chip>}
        {m.status === 'completed' && <Chip variant="mint" size="sm" icon={<Icon name="check" size={11} />}>Final</Chip>}
      </div>

      {/* Teams */}
      {['a','b'].map(side => {
        const team = m[side];
        const isWinner = winner === side;
        return (
          <div key={side} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0', borderTop: side === 'b' ? '1px solid var(--border-soft)' : 'none',
            opacity: winner && !isWinner ? 0.55 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--r-sm)',
                background: team.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 11, color: 'var(--ink-900)', flexShrink: 0,
              }}>{team.short}</div>
              <span style={{ fontWeight: isWinner ? 800 : 700, fontSize: 14, color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</span>
              {isWinner && <Icon name="check" size={14} color="var(--mint-600)" strokeWidth={3} />}
            </div>
            <div className="uac-num" style={{ display: 'flex', gap: 10 }}>
              {m.sets.length > 0 ? m.sets.map((s, i) => (
                <span key={i} style={{
                  fontSize: 16, fontWeight: 800,
                  color: s[side] > s[side === 'a' ? 'b' : 'a'] ? 'var(--ink-900)' : 'var(--ink-400)',
                  width: 22, textAlign: 'center',
                }}>{s[side]}</span>
              )) : <span style={{ fontSize: 13, color: 'var(--ink-400)' }}>—</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const BracketMatch = ({ m, side = 'left', highlight = false }) => {
  const aw = m.score && parseInt(m.score.split('-')[0]) > parseInt(m.score.split('-')[1]);
  const bw = !aw;
  return (
    <div style={{
      background: 'var(--surface)', border: `1.5px solid ${highlight ? 'var(--court-400)' : 'var(--border-soft)'}`,
      borderRadius: 'var(--r-md)', overflow: 'hidden', minWidth: 200,
      boxShadow: highlight ? '0 0 0 4px rgba(123,195,255,0.18)' : 'var(--shadow-xs)',
    }}>
      {[
        { t: m.a, win: aw },
        { t: m.b, win: bw },
      ].map((row, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', gap: 10,
          borderTop: i === 1 ? '1px solid var(--border-soft)' : 'none',
          background: row.win ? 'var(--court-50)' : 'transparent',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: row.t.color, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{row.t.short}</div>
            <span style={{ fontSize: 12, fontWeight: row.win ? 800 : 600, color: row.win ? 'var(--ink-900)' : 'var(--ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.t.name}</span>
          </div>
          <span className="uac-num" style={{ fontSize: 13, fontWeight: 800, color: row.win ? 'var(--court-700)' : 'var(--ink-400)' }}>{i === 0 ? m.score.split('-')[0] : m.score.split('-')[1]}</span>
        </div>
      ))}
    </div>
  );
};

const CompTournament = () => (
  <div style={{ width: 1080, padding: 48, background: 'var(--surface)' }}>
    <SectionHeading eyebrow="Components" title="Tournament UI" subtitle="The core building blocks: tournament card, standings table, match card, bracket node." />

    <SubTitle>Tournament cards</SubTitle>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
      {TOURNAMENTS.slice(0, 3).map(t => <TournamentCard key={t.id} t={t} />)}
    </div>

    <SubTitle>Standings table</SubTitle>
    <div style={{ marginBottom: 32 }}>
      <StandingsTable rows={STANDINGS} />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <div>
        <SubTitle>Match cards · all states</SubTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MatchCard m={MATCHES[0]} />
          <MatchCard m={MATCHES[1]} />
          <MatchCard m={MATCHES[2]} />
        </div>
      </div>
      <div>
        <SubTitle>Bracket nodes</SubTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <BracketMatch m={BRACKET_QF[0]} highlight />
          <BracketMatch m={BRACKET_QF[1]} />
          <BracketMatch m={BRACKET_QF[2]} />
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { CompButtons, CompForms, CompTournament, TournamentCard, StandingsTable, MatchCard, BracketMatch });
