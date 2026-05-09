# ESLint Security Setup

## Configuration

ESLint is configured with security scanning via `.eslintrc.json`. The configuration includes:

- **eslint-plugin-security** — Detects unsafe code patterns (eval, ReDoS, etc.)
- **@typescript-eslint/eslint-plugin** — TypeScript-specific rules

## Installation (when npm is stable)

```bash
npm install --save-dev eslint eslint-plugin-security @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

## Usage

```bash
npm run lint           # Check all TypeScript files for issues
npm run lint:fix       # Auto-fix fixable issues
```

## Configuration Details

**File:** `.eslintrc.json`

**Key security rules:**
```json
{
  "rules": {
    "security/detect-unsafe-regex": "error",      // Block ReDoS patterns
    "security/detect-buffer-noassert": "error",   // Buffer safety
    "security/detect-disable-mustache-escape": "error",
    "no-eval": "error",                           // Block eval()
    "no-implied-eval": "error",                   // Block Function()
    "no-new-func": "error",                       // Block new Function()
    "no-script-url": "error",                     // Block javascript: URLs
    "no-with": "error"                            // Block with() statement
  }
}
```

**Warning-level rules (review required):**
- `security/detect-object-injection` — Potential object property injection
- `security/detect-child-process` — Child process execution
- `security/detect-non-literal-fs-filename` — Dynamic file paths
- `security/detect-potential-timing-attacks` — Timing-based attacks

## Running ESLint

In CI/CD pipeline, add to `.github/workflows/ci.yml`:
```yaml
- name: Run ESLint
  run: npm run lint
```

Block PRs if ESLint fails.

## Ignoring Rules

For legitimate cases, suppress rules with comments:

```typescript
// eslint-disable-next-line security/detect-object-injection
const value = obj[userInput]  // OK if userInput is validated
```

Always include a reason why the rule is disabled.

## Common Warnings vs Errors

**Errors** (must fix):
- Unsafe regex patterns
- eval() usage
- Missing bounds checking

**Warnings** (review required):
- Dynamic file paths (ensure user input is validated)
- Child process spawning (ensure args are safe)
- Object injection (ensure keys are from trusted sources)

## Next Steps

1. Once npm is stable, run: `npm install --save-dev eslint eslint-plugin-security @typescript-eslint/eslint-plugin @typescript-eslint/parser`
2. Test: `npm run lint`
3. Add to pre-commit hook: `npm run lint` before `npm test`
4. Add to CI/CD pipeline: Require `npm run lint` to pass on all PRs

## References

- [ESLint Security Plugin](https://github.com/nodesecurity/eslint-plugin-security)
- [ESLint Configuration](https://eslint.org/docs/user-guide/configuring)
- [TypeScript ESLint](https://typescript-eslint.io/)
