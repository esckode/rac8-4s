// =====================================================
// Foundation: logo, color, type, spacing, shape
// =====================================================

const FoundationLogo = () => (
  <div style={{ width: 1080, padding: 48, fontFamily: 'var(--font-ui)', background: 'var(--surface)' }}>
    <SectionHeading eyebrow="Brand" title="The mark" subtitle="Two nested crescents form C·U — the name reads through the mark itself." />

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
      {/* Primary lockup on light */}
      <div style={{ background: 'var(--surface-tint)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-2xl)', padding: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Logo size={42} tagline />
      </div>
      {/* On dark — inverse */}
      <div style={{ background: 'var(--ink-900)', borderRadius: 'var(--r-2xl)', padding: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Logo size={42} tone="light" tagline />
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
      {/* Mark scales */}
      {[120, 80, 56, 36].map(s => (
        <div key={s} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <LogoMark size={s} color="var(--court-400)" accent="var(--court-500)" />
          <div style={{ fontSize: 11, color: 'var(--ink-500)', fontWeight: 600 }}>{s}px</div>
        </div>
      ))}
    </div>

    <SectionHeading title="App icon variants" subtitle="The mark on solid pastel surfaces — used for tile launchers, notifications, OG cards." />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
      {[
        { bg: 'var(--court-400)', mark: '#FFFFFF', acc: 'rgba(255,255,255,0.7)' },
        { bg: 'var(--lavender-300)', mark: '#FFFFFF', acc: 'rgba(255,255,255,0.7)' },
        { bg: 'var(--peach-200)', mark: 'var(--ink-900)', acc: 'var(--ink-700)' },
        { bg: 'var(--mint-200)', mark: 'var(--ink-900)', acc: 'var(--ink-700)' },
        { bg: 'var(--pink-300)', mark: '#FFFFFF', acc: 'rgba(255,255,255,0.7)' },
        { bg: 'var(--ink-900)', mark: 'var(--court-400)', acc: 'var(--court-300)' },
      ].map((c, i) => (
        <div key={i} style={{ aspectRatio: '1/1', background: c.bg, borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <LogoMark size={72} color={c.mark} accent={c.acc} />
        </div>
      ))}
    </div>

    <div style={{ marginTop: 32, padding: 20, background: 'var(--court-100)', borderRadius: 'var(--r-lg)', border: '1px solid var(--court-200)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <Icon name="info" color="var(--court-700)" size={20} />
      <div style={{ fontSize: 13, color: 'var(--court-900)', lineHeight: 1.6 }}>
        <strong>Clear space:</strong> keep at least the width of one crescent around the mark. <strong>Minimum size:</strong> 24px (mark only). The wordmark is locked — never re-letter or re-space.
      </div>
    </div>
  </div>
);

const FoundationColor = () => {
  const families = [
    { name: 'Court', desc: 'Primary — sky blue from the logo. Use for actions, links, live data.', stops: [
      { n: 50, v: '#F5FAFF' }, { n: 100, v: '#EAF4FF' }, { n: 200, v: '#C9E5FF' },
      { n: 300, v: '#A8D5FF' }, { n: 400, v: '#7BC3FF', primary: true }, { n: 500, v: '#4FA9F0' },
      { n: 600, v: '#2E8AD4' }, { n: 700, v: '#1F6BAA' }, { n: 900, v: '#0F3D6B' },
    ]},
    { name: 'Lavender', desc: 'Secondary — knockout phase, premium accents.', stops: [
      { n: 50, v: '#FAF6FF' }, { n: 100, v: '#F2EBFF' }, { n: 200, v: '#E0CFF7' },
      { n: 300, v: '#C5AEEF' }, { n: 400, v: '#A98AE0', primary: true }, { n: 500, v: '#8E69C9' },
      { n: 700, v: '#5F3FA0' },
    ]},
    { name: 'Mint', desc: 'Wins, live status, success states.', stops: [
      { n: 100, v: '#E8F8EF' }, { n: 200, v: '#C6EFD6' }, { n: 400, v: '#6BCF96', primary: true }, { n: 600, v: '#2F9D6B' },
    ]},
    { name: 'Peach', desc: 'Draft / warning. Use for organizer flags.', stops: [
      { n: 100, v: '#FFF2E0' }, { n: 200, v: '#FFDDB3' }, { n: 400, v: '#FFB35F', primary: true }, { n: 600, v: '#D87A1F' },
    ]},
    { name: 'Pink',   desc: 'Social moments — hearts, reactions, friend activity.', stops: [
      { n: 100, v: '#FFEBF4' }, { n: 300, v: '#FFB3D9', primary: true }, { n: 500, v: '#E36EA8' },
    ]},
    { name: 'Gold',   desc: 'Trophy / complete. Reserved for podium moments.', stops: [
      { n: 200, v: '#FFE8A3' }, { n: 400, v: '#F2C24A', primary: true }, { n: 600, v: '#B58308' },
    ]},
  ];
  return (
    <div style={{ width: 1080, padding: 48, background: 'var(--surface)' }}>
      <SectionHeading eyebrow="Color" title="A confident pastel palette" subtitle="Pastels lead, not as backdrops but as primary brand surfaces. Use one family per moment; avoid stacking three." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {families.map(f => (
          <div key={f.name}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <h3 className="uac-display" style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{f.name}</h3>
                <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>{f.desc}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${f.stops.length}, 1fr)`, gap: 8 }}>
              {f.stops.map(s => (
                <div key={s.n} style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: s.primary ? '2px solid var(--ink-900)' : '1px solid var(--border-soft)' }}>
                  <div style={{ background: s.v, height: 64 }} />
                  <div style={{ padding: '8px 10px', background: 'var(--surface)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-900)' }}>{f.name.toLowerCase()}/{s.n}</div>
                    <div className="uac-mono" style={{ fontSize: 10, color: 'var(--ink-500)', marginTop: 2 }}>{s.v}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40 }}>
        <h3 className="uac-display" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px' }}>Ink (neutrals)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
          {[50,100,200,300,400,500,600,700,800,900].map(n => (
            <div key={n} style={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
              <div style={{ background: `var(--ink-${n})`, height: 56 }} />
              <div style={{ padding: '6px 8px', background: 'var(--surface)', fontSize: 11, fontWeight: 700 }}>{n}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 40 }}>
        <h3 className="uac-display" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px' }}>Tournament phase semantics</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <PhaseBadge phase="reg-open" />
          <PhaseBadge phase="reg-closed" />
          <PhaseBadge phase="group" />
          <PhaseBadge phase="knockout" />
          <PhaseBadge phase="complete" />
          <PhaseBadge phase="draft" />
        </div>
      </div>
    </div>
  );
};

const FoundationType = () => (
  <div style={{ width: 1080, padding: 48, background: 'var(--surface)' }}>
    <SectionHeading eyebrow="Typography" title="Fredoka × Plus Jakarta Sans" subtitle="Fredoka brings the rounded warmth of the logo wordmark; Plus Jakarta keeps UI legible at small sizes." />

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
      <Card variant="default" padding={28}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--court-600)', letterSpacing: '0.1em', marginBottom: 12 }}>DISPLAY · FREDOKA</div>
        <div className="uac-display" style={{ fontSize: 64, fontWeight: 600, lineHeight: 0.95, letterSpacing: '-0.025em', color: 'var(--ink-900)' }}>
          Aa
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 16, fontFamily: 'var(--font-display)' }}>
          The quick brown shuttle flies over the lazy net 0123456789
        </div>
      </Card>
      <Card variant="default" padding={28}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--lavender-500)', letterSpacing: '0.1em', marginBottom: 12 }}>UI · PLUS JAKARTA SANS</div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.03em' }}>Aa</div>
        <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 16 }}>
          The quick brown shuttle flies over the lazy net 0123456789
        </div>
      </Card>
    </div>

    <h3 className="uac-display" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px' }}>Type scale</h3>
    <Card variant="default" padding={0} style={{ overflow: 'hidden' }}>
      {[
        { name: 'Display / XL',   size: 56, weight: 600, family: 'display', sample: 'Make Your Play Count' },
        { name: 'Display / L',    size: 40, weight: 600, family: 'display', sample: 'Friday Night Smash' },
        { name: 'Display / M',    size: 28, weight: 600, family: 'display', sample: 'Group Stage' },
        { name: 'Heading / L',    size: 22, weight: 700, family: 'ui',      sample: 'Tonight at Riverside SC' },
        { name: 'Heading / M',    size: 18, weight: 700, family: 'ui',      sample: 'Group A · Standings' },
        { name: 'Body / L',       size: 16, weight: 500, family: 'ui',      sample: 'Aanya & Marcus beat Mei & Ravi 2–0' },
        { name: 'Body / M',       size: 14, weight: 500, family: 'ui',      sample: 'Updates live as scores are submitted.' },
        { name: 'Caption',        size: 12, weight: 600, family: 'ui',      sample: 'Court 3 · 7:00 PM · Doubles' },
        { name: 'Eyebrow',        size: 11, weight: 700, family: 'ui',      sample: 'GROUP STAGE · ROUND 2', upper: true, color: 'var(--court-600)' },
      ].map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '180px 100px 1fr', alignItems: 'baseline',
          padding: '16px 24px', borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none', gap: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)' }}>{row.name}</div>
          <div className="uac-mono" style={{ fontSize: 12, color: 'var(--ink-500)' }}>{row.size} · {row.weight}</div>
          <div style={{
            fontSize: row.size, fontWeight: row.weight,
            fontFamily: row.family === 'display' ? 'var(--font-display)' : 'var(--font-ui)',
            letterSpacing: row.family === 'display' ? '-0.02em' : (row.upper ? '0.12em' : '-0.005em'),
            textTransform: row.upper ? 'uppercase' : 'none',
            color: row.color || 'var(--ink-900)',
            lineHeight: 1.1,
          }}>{row.sample}</div>
        </div>
      ))}
    </Card>
  </div>
);

const FoundationShape = () => (
  <div style={{ width: 1080, padding: 48, background: 'var(--surface)' }}>
    <SectionHeading eyebrow="Shape · Space · Light" title="Soft rules" subtitle="Generous radii, calm shadows, predictable spacing." />

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
      {/* Radius */}
      <Card padding={24}>
        <h3 className="uac-display" style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>Radius</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { l: 'xs', v: 6 }, { l: 'sm', v: 8 }, { l: 'md', v: 12 }, { l: 'lg', v: 16 },
            { l: 'xl', v: 20 }, { l: '2xl', v: 24 }, { l: '3xl', v: 32 }, { l: 'full', v: 999 },
          ].map(r => (
            <div key={r.l} style={{ textAlign: 'center' }}>
              <div style={{ width: '100%', aspectRatio: '1/1', background: 'var(--court-200)', borderRadius: r.v, border: '1px solid var(--court-300)' }} />
              <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700 }}>{r.l}</div>
              <div className="uac-mono" style={{ fontSize: 10, color: 'var(--ink-500)' }}>{r.v === 999 ? '∞' : `${r.v}px`}</div>
            </div>
          ))}
        </div>
      </Card>
      {/* Shadow */}
      <Card padding={24}>
        <h3 className="uac-display" style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>Elevation</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { l: 'xs', v: 'var(--shadow-xs)' },
            { l: 'sm', v: 'var(--shadow-sm)' },
            { l: 'md', v: 'var(--shadow-md)' },
            { l: 'lg', v: 'var(--shadow-lg)' },
            { l: 'xl', v: 'var(--shadow-xl)' },
          ].map(sh => (
            <div key={sh.l} style={{
              padding: '14px 18px', background: 'var(--surface)', borderRadius: 'var(--r-md)',
              boxShadow: sh.v, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              border: '1px solid var(--border-soft)',
            }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>shadow / {sh.l}</span>
              <span className="uac-mono" style={{ fontSize: 11, color: 'var(--ink-500)' }}>tinted</span>
            </div>
          ))}
        </div>
      </Card>
    </div>

    <Card padding={24}>
      <h3 className="uac-display" style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>Spacing scale</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        {[
          { l: '1', v: 4 }, { l: '2', v: 8 }, { l: '3', v: 12 }, { l: '4', v: 16 },
          { l: '5', v: 20 }, { l: '6', v: 24 }, { l: '8', v: 32 }, { l: '10', v: 40 },
          { l: '12', v: 48 }, { l: '16', v: 64 },
        ].map(s => (
          <div key={s.l} style={{ textAlign: 'center' }}>
            <div style={{ width: s.v, height: s.v, background: 'var(--lavender-300)', borderRadius: 4, margin: '0 auto' }} />
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 8 }}>s/{s.l}</div>
            <div className="uac-mono" style={{ fontSize: 10, color: 'var(--ink-500)' }}>{s.v}</div>
          </div>
        ))}
      </div>
    </Card>

    <div style={{ marginTop: 24 }}>
      <Card padding={24}>
        <h3 className="uac-display" style={{ fontSize: 18, fontWeight: 600, margin: '0 0 16px' }}>Motifs</h3>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 96, height: 96, background: 'var(--court-100)', borderRadius: 'var(--r-2xl)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shuttle size={56} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>Shuttle</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>Tickers, empty states</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 196, height: 96, background: 'var(--surface-tint)', borderRadius: 'var(--r-2xl)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-soft)' }}>
              <CourtDoodle width={160} height={70} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>Court schematic</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>Headers, dividers</div>
          </div>
        </div>
      </Card>
    </div>
  </div>
);

/* ============================================================ */
/* Layout & breakpoints — how the system scales across devices  */
/* ============================================================ */

// Mini phone — used to visualize how layout adapts at each tier.
// Renders an iPhone-ish frame at the given inner width and shows
// either a generic content scaffold or a status-card scaffold.
const PhoneScale = ({ w, h = 220, label, tier, padding, columns = 1, gutter, type, accent = 'var(--court-300)', kind = 'list' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
    <div style={{
      width: w + 12, height: h + 12, padding: 6,
      borderRadius: 24, background: 'var(--ink-900)', boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{
        width: w, height: h, borderRadius: 18, background: 'var(--surface-tint)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 8, fontWeight: 700, color: 'var(--ink-700)' }}>
          <span>9:41</span>
          <span>···</span>
        </div>
        {/* content */}
        <div style={{ padding }}>
          {kind === 'list' && (
            <>
              <div style={{ fontSize: type.h, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 6, letterSpacing: '-0.02em' }}>Browse</div>
              <div style={{ fontSize: type.cap, color: 'var(--ink-500)', marginBottom: 10 }}>Tonight</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: gutter }}>
                {Array.from({ length: columns === 1 ? 3 : 4 }).map((_, i) => (
                  <div key={i} style={{
                    background: 'var(--surface)', border: '1px solid var(--border-soft)',
                    borderRadius: 8, padding: padding * 0.6, display: 'flex',
                    flexDirection: columns === 1 ? 'row' : 'column', alignItems: columns === 1 ? 'center' : 'flex-start', gap: 6,
                  }}>
                    <div style={{ width: columns === 1 ? 18 : '100%', height: columns === 1 ? 18 : 18, background: accent, borderRadius: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ height: 4, background: 'var(--ink-200)', borderRadius: 2, marginBottom: 3, width: '80%' }} />
                      <div style={{ height: 3, background: 'var(--ink-100)', borderRadius: 2, width: '50%' }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    <div style={{ textAlign: 'center' }}>
      <div className="uac-display" style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      <div className="uac-mono" style={{ fontSize: 11, color: 'var(--ink-500)' }}>{tier}</div>
    </div>
  </div>
);

const FoundationLayout = () => {
  const tiers = [
    { key: 'compact', label: 'Compact', range: '320–374', device: 'iPhone SE · small Android', pad: 16, gutter: 8, type: { h: 18, body: 13, cap: 10 }, columns: 1 },
    { key: 'regular', label: 'Regular', range: '375–413', device: 'iPhone 13/14/15 · Pixel', pad: 20, gutter: 12, type: { h: 22, body: 14, cap: 11 }, columns: 1, primary: true },
    { key: 'large',   label: 'Large',   range: '414–599', device: 'Pro Max · Galaxy Ultra',  pad: 24, gutter: 14, type: { h: 24, body: 15, cap: 12 }, columns: 2 },
    { key: 'tablet',  label: 'Tablet',  range: '600–959', device: 'iPad · Surface mini',      pad: 28, gutter: 16, type: { h: 28, body: 16, cap: 12 }, columns: 2 },
    { key: 'desktop', label: 'Desktop', range: '960+',    device: 'Laptop · monitor',         pad: 32, gutter: 20, type: { h: 32, body: 16, cap: 12 }, columns: 3 },
  ];

  return (
    <div style={{ width: 1080, padding: 48, background: 'var(--surface)', fontFamily: 'var(--font-ui)' }}>
      <SectionHeading
        eyebrow="Layout"
        title="Breakpoints & scaling"
        subtitle="One design system, five form factors. Mobile is the canonical artboard (375); everything else flexes from there."
      />

      {/* === BREAKPOINT TABLE === */}
      <Card padding={0} style={{ overflow: 'hidden', marginBottom: 32 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '120px 110px 1fr 90px 90px 70px',
          padding: '12px 20px', background: 'var(--ink-50)',
          fontSize: 10, fontWeight: 800, color: 'var(--ink-500)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          <span>Tier</span><span>Range (px)</span><span>Reference device</span><span>Padding</span><span>Gutter</span><span>Cols</span>
        </div>
        {tiers.map((t, i) => (
          <div key={t.key} style={{
            display: 'grid', gridTemplateColumns: '120px 110px 1fr 90px 90px 70px',
            alignItems: 'center', padding: '14px 20px',
            borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none',
            background: t.primary ? 'var(--court-50)' : 'transparent',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: t.primary ? 'var(--court-500)' : 'var(--ink-300)' }} />
              <strong style={{ fontSize: 14 }}>{t.label}</strong>
              {t.primary && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--court-700)', background: 'var(--court-200)', padding: '2px 5px', borderRadius: 4, letterSpacing: '0.05em' }}>BASE</span>}
            </span>
            <span className="uac-mono" style={{ fontSize: 13, color: 'var(--ink-700)' }}>{t.range}</span>
            <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>{t.device}</span>
            <span className="uac-mono" style={{ fontSize: 12 }}>{t.pad}px</span>
            <span className="uac-mono" style={{ fontSize: 12 }}>{t.gutter}px</span>
            <span className="uac-mono" style={{ fontSize: 12 }}>{t.columns}</span>
          </div>
        ))}
      </Card>

      {/* === VISUAL COMPARISON === */}
      <h3 className="uac-display" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>Same screen, three phone widths</h3>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginBottom: 20 }}>
        Cards collapse to a single column on Compact; jump to two columns at Large. Type and padding tokens follow.
      </div>
      <div style={{ display: 'flex', gap: 24, padding: '24px 16px', background: 'var(--surface-tint)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 40, overflow: 'hidden' }}>
        <PhoneScale w={156} h={240} label="Compact" tier="375 reference shown @ 320" padding={tiers[0].pad * 0.6} gutter={tiers[0].gutter * 0.6} columns={1} type={{ h: 14, body: 11, cap: 9 }} accent="var(--court-200)" />
        <PhoneScale w={182} h={252} label="Regular · base" tier="375 px"             padding={tiers[1].pad * 0.55} gutter={tiers[1].gutter * 0.55} columns={1} type={{ h: 16, body: 12, cap: 9 }} accent="var(--court-300)" />
        <PhoneScale w={206} h={260} label="Large" tier="414 px"                       padding={tiers[2].pad * 0.5} gutter={tiers[2].gutter * 0.55} columns={2} type={{ h: 17, body: 12, cap: 9 }} accent="var(--lavender-300)" />
      </div>

      {/* === SCALING RULES === */}
      <h3 className="uac-display" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px' }}>Scaling rules</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        {/* Type scaling */}
        <Card padding={20}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--court-600)', letterSpacing: '0.1em', marginBottom: 10 }}>FLUID TYPE</div>
          <div className="uac-mono" style={{ fontSize: 12, background: 'var(--ink-50)', padding: 12, borderRadius: 'var(--r-sm)', color: 'var(--ink-800)', lineHeight: 1.55, marginBottom: 12 }}>
            font-size:<br/>&nbsp;&nbsp;clamp(min, fluid, max);
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--ink-600)' }}>
            {[
              { name: 'Display / L', f: 'clamp(28px, 5.5vw, 40px)' },
              { name: 'Heading / L', f: 'clamp(18px, 3.2vw, 22px)' },
              { name: 'Body / M', f: '14px (fixed)' },
              { name: 'Caption',  f: '12px (fixed)' },
            ].map(r => (
              <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border-soft)' }}>
                <span style={{ fontWeight: 700 }}>{r.name}</span>
                <span className="uac-mono" style={{ color: 'var(--ink-500)', fontSize: 11 }}>{r.f}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Touch targets */}
        <Card padding={20}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--lavender-500)', letterSpacing: '0.1em', marginBottom: 10 }}>TOUCH TARGETS</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14 }}>
            {[
              { v: 32, l: 'Too small', c: 'var(--rose-100)', bd: 'var(--rose-400)', tx: 'var(--rose-600)' },
              { v: 44, l: 'Minimum',   c: 'var(--peach-200)', bd: 'var(--peach-400)', tx: 'var(--peach-600)' },
              { v: 48, l: 'Comfortable', c: 'var(--mint-200)', bd: 'var(--mint-400)', tx: 'var(--mint-600)' },
              { v: 56, l: 'Primary',   c: 'var(--court-200)', bd: 'var(--court-500)', tx: 'var(--court-700)' },
            ].map(t => (
              <div key={t.v} style={{ textAlign: 'center' }}>
                <div style={{
                  width: t.v, height: t.v, background: t.c, border: `1.5px solid ${t.bd}`,
                  borderRadius: 8, marginBottom: 6,
                }} />
                <div style={{ fontSize: 10, fontWeight: 800, color: t.tx }}>{t.v}px</div>
                <div style={{ fontSize: 10, color: 'var(--ink-500)' }}>{t.l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.5 }}>
            <strong>Floor: 44 × 44</strong> for any tap target. Spacing between adjacent targets ≥ 8px. Primary CTAs are 56px tall on mobile.
          </div>
        </Card>

        {/* Safe area */}
        <Card padding={20}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--mint-600)', letterSpacing: '0.1em', marginBottom: 10 }}>SAFE AREAS</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 90, height: 160, background: 'var(--ink-900)', borderRadius: 16, padding: 4 }}>
              <div style={{ width: '100%', height: '100%', background: 'var(--court-100)', borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
                {/* notch */}
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 36, height: 14, background: 'var(--ink-900)', borderRadius: '0 0 8px 8px' }} />
                {/* safe inset */}
                <div style={{ position: 'absolute', top: 18, left: 6, right: 6, bottom: 14, border: '1px dashed var(--court-600)', borderRadius: 8, background: 'rgba(255,255,255,0.5)' }} />
                {/* home indicator */}
                <div style={{ position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)', width: 36, height: 3, background: 'var(--ink-700)', borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-600)', lineHeight: 1.55 }}>
              Respect <code className="uac-mono" style={{ fontSize: 11, background: 'var(--ink-50)', padding: '1px 5px', borderRadius: 3 }}>env(safe-area-inset-*)</code>. Tab bar bottom padding = 28px (home indicator). Status bar top = 44px standard, 54px notched.
            </div>
          </div>
        </Card>

        {/* When to break to desktop */}
        <Card padding={20}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--peach-600)', letterSpacing: '0.1em', marginBottom: 10 }}>WHEN TO BREAK LAYOUT</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <span className="uac-mono" style={{ fontSize: 11, color: 'var(--ink-500)', minWidth: 70 }}>≤ 599</span>
              <span>Single column. Bottom tab bar. Full-width sheets.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
              <span className="uac-mono" style={{ fontSize: 11, color: 'var(--ink-500)', minWidth: 70 }}>600–959</span>
              <span>Two-column cards. Tab bar persists. Modals at 480px max.</span>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
              <span className="uac-mono" style={{ fontSize: 11, color: 'var(--ink-500)', minWidth: 70 }}>≥ 960</span>
              <span>Side rail nav replaces tab bar. Multi-pane layouts. Content max-width 1280.</span>
            </div>
          </div>
        </Card>
      </div>

      {/* === TOKEN OVERRIDES === */}
      <h3 className="uac-display" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px' }}>Token shifts per tier</h3>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.2fr repeat(5, 1fr)',
          padding: '12px 20px', background: 'var(--ink-50)',
          fontSize: 10, fontWeight: 800, color: 'var(--ink-500)', letterSpacing: '0.1em',
        }}>
          <span>TOKEN</span>
          {tiers.map(t => <span key={t.key} style={{ textAlign: 'center' }}>{t.label.toUpperCase()}</span>)}
        </div>
        {[
          { name: '--pad-screen',  vals: [16, 20, 24, 28, 32] },
          { name: '--gap-card',    vals: [8, 12, 14, 16, 20] },
          { name: '--font-display-l', vals: [28, 32, 36, 40, 48] },
          { name: '--font-heading-l', vals: [18, 22, 22, 24, 26] },
          { name: '--radius-card', vals: [12, 16, 16, 20, 20] },
          { name: 'tap-target',    vals: [44, 44, 48, 48, 40] },
        ].map((row, i) => (
          <div key={row.name} style={{
            display: 'grid', gridTemplateColumns: '1.2fr repeat(5, 1fr)',
            padding: '12px 20px', borderTop: '1px solid var(--border-soft)',
            alignItems: 'center',
          }}>
            <span className="uac-mono" style={{ fontSize: 12, color: 'var(--ink-700)', fontWeight: 600 }}>{row.name}</span>
            {row.vals.map((v, j) => (
              <span key={j} className="uac-mono" style={{
                textAlign: 'center', fontSize: 13,
                fontWeight: j === 1 ? 800 : 500,
                color: j === 1 ? 'var(--court-700)' : 'var(--ink-700)',
              }}>{v}px</span>
            ))}
          </div>
        ))}
      </Card>

      <div style={{ marginTop: 24, padding: 16, background: 'var(--court-100)', borderRadius: 'var(--r-lg)', border: '1px solid var(--court-200)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Icon name="info" color="var(--court-700)" size={20} />
        <div style={{ fontSize: 13, color: 'var(--court-900)', lineHeight: 1.6 }}>
          <strong>Base everything at 375.</strong> Build to the Regular tier first; let the Density tweak handle Compact (it tightens padding). Only break to multi-column at 600+. Above 960, switch to the organizer (desktop) layout — same components, sidebar nav.
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { FoundationLogo, FoundationColor, FoundationType, FoundationShape, FoundationLayout, PhoneScale });
