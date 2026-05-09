# Security Guidelines

This document outlines security practices and tooling for the tournament management webapp.

## Vulnerability Scanning

### npm audit
Check dependencies for known vulnerabilities:
```bash
npm audit              # Full report (including dev dependencies)
npm audit --production # Only production dependencies
npm audit fix          # Auto-fix fixable vulnerabilities
```

### ESLint Security Plugin
Static analysis for code-level security issues:
```bash
npm run lint           # Check for security issues
npm run lint:fix       # Auto-fix fixable issues
```

**Installed plugins:**
- `eslint-plugin-security` — detects unsafe patterns (eval, regex DoS, etc.)
- `@typescript-eslint/eslint-plugin` — TypeScript-specific rules

**Security rules enforced:**
- ❌ No `eval()`, `Function()` constructor, or `setTimeout(code)`
- ❌ No unsafe regular expressions (ReDoS attacks)
- ❌ No buffer operations without bounds checking
- ⚠️ Object property access validation (detect injection)
- ⚠️ Child process usage flagged (review required)
- ⚠️ File I/O with dynamic paths (validate user input)

## Input Validation

**All user input must be validated at system boundaries:**
- ✅ API request payloads (validate before processing)
- ✅ Magic link tokens (validate format and expiry)
- ✅ Score submissions (validate format against rules)
- ✅ Tournament configuration (validate date ranges, counts)

**Do NOT validate:**
- Internal function arguments (trust the codebase)
- Pre-processed data from other validated functions

## Common Vulnerabilities to Avoid

### 1. Injection Attacks
```typescript
// ❌ BAD: User input in SQL/command
const query = `SELECT * FROM players WHERE id = ${userId}`

// ✅ GOOD: Parameterized queries
const query = 'SELECT * FROM players WHERE id = ?'
db.query(query, [userId])
```

### 2. Regular Expression DoS (ReDoS)
```typescript
// ❌ BAD: Catastrophic backtracking
const regex = /^(a+)+$/  // Can hang on long strings

// ✅ GOOD: Anchored, bounded patterns
const regex = /^[a-z]{1,50}$/
```

### 3. Unvalidated Redirects
```typescript
// ❌ BAD: Redirect to user-controlled URL
res.redirect(req.query.returnUrl)

// ✅ GOOD: Whitelist allowed URLs
const allowedUrls = ['/dashboard', '/tournaments']
if (allowedUrls.includes(req.query.returnUrl)) {
  res.redirect(req.query.returnUrl)
}
```

### 4. Sensitive Data Exposure
```typescript
// ❌ BAD: Log passwords or tokens
console.log(`User login: ${email} / ${password}`)

// ✅ GOOD: Never log sensitive data
console.log(`User login: ${email}`)  // Email only
```

### 5. Missing Authentication/Authorization
```typescript
// ❌ BAD: No permission check
app.get('/tournaments/:id/scores', (req, res) => {
  const scores = db.getScores(req.params.id)
  res.json(scores)
})

// ✅ GOOD: Verify user can access
app.get('/tournaments/:id/scores', requireAuth, (req, res) => {
  const tournament = db.getTournament(req.params.id)
  if (tournament.organizer !== req.user.id && !tournament.players.includes(req.user.id)) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  res.json(tournament.scores)
})
```

## Data Protection

### Passwords
- Use bcrypt with salt rounds ≥ 10
- Never store plaintext passwords
- Never log passwords

### Tokens
- Use cryptographically secure random generation
- Set expiration times
- Invalidate on logout
- Store in Redis (session-like) or JWT (stateless)

### API Keys & Secrets
- Store in environment variables (`.env` file, not in git)
- Use different keys for dev/staging/production
- Rotate regularly
- Never commit `.env` to git

### PII (Personally Identifiable Information)
- Only collect what's necessary
- Encrypt in transit (HTTPS) and at rest
- Implement data retention policies
- GDPR: Support data export and deletion

## OWASP Top 10 Checklist

- [ ] **A01:2021 — Broken Access Control** → Verify authorization on all endpoints
- [ ] **A02:2021 — Cryptographic Failures** → Use HTTPS, hash passwords, encrypt sensitive data
- [ ] **A03:2021 — Injection** → Use parameterized queries, validate input
- [ ] **A04:2021 — Insecure Design** → Threat model during design, security by default
- [ ] **A05:2021 — Security Misconfiguration** → Minimal permissions, secure defaults
- [ ] **A06:2021 — Vulnerable Components** → `npm audit`, keep dependencies updated
- [ ] **A07:2021 — Authentication Failures** → 2FA, secure token handling, rate limiting
- [ ] **A08:2021 — Data Integrity Failures** → Validate data, use transactions
- [ ] **A09:2021 — Logging/Monitoring Failures** → Log security events, alert on anomalies
- [ ] **A10:2021 — SSRF** → Validate URLs, deny private IP ranges

## Code Review Checklist

Before merging, verify:
- [ ] ESLint passes (`npm run lint`)
- [ ] No hardcoded secrets or credentials
- [ ] User input is validated
- [ ] Authorization checks are present
- [ ] Sensitive data not logged
- [ ] SQL/NoSQL queries are parameterized
- [ ] Dependencies are up-to-date (`npm audit`)
- [ ] No new security warnings introduced

## Continuous Security

### Pre-commit Hook (recommended future addition)
```bash
npm run lint
npm audit --production
npm test
```

### CI/CD Pipeline (recommended)
- Run `npm audit` on every PR
- Run `npm run lint` on every commit
- Block merges if security issues found
- Automated dependency updates (Dependabot)

## Contact & Reporting

If you discover a security vulnerability, please report it responsibly:
1. Do NOT open a public GitHub issue
2. Email: [security contact email]
3. Include reproduction steps if possible

## References

- [OWASP Top 10](https://owasp.org/Top10/)
- [NPM Security Best Practices](https://docs.npmjs.com/security)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [ESLint Security Plugin](https://github.com/nodesecurity/eslint-plugin-security)
