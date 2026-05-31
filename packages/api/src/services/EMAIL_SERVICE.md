# Email Service Implementation

This module provides configurable email sending capabilities with support for multiple email service providers.

## Overview

The email service system consists of three components:

1. **IEmailService Interface** — Defines the contract for email sending
2. **Email Service Implementations** — Mock, SendGrid, and AWS SES services
3. **ServiceEmailAdapter** — Bridges the legacy EmailAdapter interface with IEmailService

## Service Types

### MockEmailService (Development/Testing)

Logs emails to console instead of sending them. Perfect for development and testing.

```typescript
const mockService = new MockEmailService()
await mockService.send({
  to: 'user@example.com',
  subject: 'Test Email',
  html: '<p>Test content</p>',
})
```

### SendGridEmailService (Production)

Sends emails via SendGrid API v3. Requires a valid SendGrid API key.

```typescript
const sendGridService = new SendGridEmailService('your-api-key')
await sendGridService.send({
  to: 'user@example.com',
  subject: 'Password Reset',
  html: '<p>Click here to reset your password</p>',
  text: 'Click here to reset your password',
})
```

### AwsSesEmailService (Production)

Sends emails via AWS SES API. Requires AWS credentials.

```typescript
const sesService = new AwsSesEmailService(
  'your-access-key-id',
  'your-secret-access-key',
  'us-east-1'
)
await sesService.send({
  to: 'user@example.com',
  subject: 'Password Reset',
  html: '<p>Click here to reset your password</p>',
})
```

## Configuration

### Environment Variables

Choose your email service and configure credentials via environment variables:

```bash
# Service selection (default: mock)
EMAIL_SERVICE=mock|sendgrid|aws_ses

# Email sender configuration
EMAIL_FROM_ADDRESS=noreply@example.com

# SendGrid credentials (required if EMAIL_SERVICE=sendgrid)
SENDGRID_API_KEY=your-sendgrid-api-key

# AWS SES credentials (required if EMAIL_SERVICE=aws_ses)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

### Programmatic Configuration

```typescript
import { createEmailService } from './services/email-service'

const emailService = createEmailService('sendgrid', {
  fromAddress: 'noreply@example.com',
  sendgridApiKey: process.env.SENDGRID_API_KEY,
})
```

## Integration with EmailAdapter

The system provides a `ServiceEmailAdapter` that bridges the existing `EmailAdapter` interface with `IEmailService`:

```typescript
import { ServiceEmailAdapter } from './email-service-adapter'
import { createEmailService } from './services/email-service'

const emailService = createEmailService(process.env.EMAIL_SERVICE || 'mock')
const emailAdapter = new ServiceEmailAdapter(emailService, 'noreply@example.com')

// Now use emailAdapter with existing code
await emailAdapter.send('user@example.com', 'Subject', '<p>Body</p>')
```

## Usage in Routes

The email adapter is injected into the app dependencies:

```typescript
// In app initialization
const app = createApp({
  config,
  db: pool,
  emailAdapter, // Optional - email sending gracefully fails if not provided
  // ... other dependencies
})

// In route handlers
if (deps.emailAdapter) {
  await sendPasswordResetEmail(
    deps.emailAdapter,
    deps.config.email,
    email,
    resetCode,
    15
  )
}
```

## Logging

All email service actions are logged with structured logging:

**Success (info level):**
```json
{
  "level": "info",
  "module": "email-service",
  "msg": "email.service.sent",
  "recipient": "user@example.com",
  "service": "sendgrid",
  "subject": "Reset Your Password"
}
```

**Failure (error level):**
```json
{
  "level": "error",
  "module": "email-service",
  "msg": "email.service.failed",
  "recipient": "user@example.com",
  "service": "sendgrid",
  "error": "SendGrid API error: 401 Unauthorized"
}
```

## Email Validation

All email addresses are validated using basic RFC 5322 compliance:

- Must contain exactly one `@` symbol
- Must have content before and after `@`
- Must have a dot in the domain part

```typescript
// Valid
- user@example.com
- user+tag@subdomain.example.com
- user.name@example.co.uk

// Invalid
- invalid-email
- @example.com
- user@
```

## Error Handling

### Mock Service

Never throws errors - safe for development.

### SendGrid Service

Throws errors on:
- Invalid email address
- API authentication failure (401)
- Invalid API payload (400)
- Rate limiting (429)
- Service unavailable (5xx)

### AWS SES Service

Throws errors on:
- Invalid email address
- Invalid AWS credentials
- Service unavailable

## Testing

### Unit Tests

```bash
npm test -- --testPathPattern="email-service" --no-coverage
```

### Integration Tests

```bash
npm test -- --testPathPattern="email-service-adapter" --no-coverage
```

## Production Recommendations

1. **Never commit credentials** — Use environment variables
2. **Use SendGrid or AWS SES** in production, not mock
3. **Monitor logs** for failed sends
4. **Set up alerts** for high error rates
5. **Test email sending** before deploying
6. **Use verified sender addresses** (SendGrid/SES requirement)

## Example: Complete Setup

```typescript
// 1. Install dependencies
// npm install (SendGrid/SES SDKs optional)

// 2. Set environment variables
// EMAIL_SERVICE=sendgrid
// SENDGRID_API_KEY=your-key
// EMAIL_FROM_ADDRESS=noreply@example.com

// 3. Initialize in your app
import { createEmailService } from './services/email-service'
import { ServiceEmailAdapter } from './email-service-adapter'

const emailService = createEmailService(
  process.env.EMAIL_SERVICE || 'mock',
  {
    fromAddress: process.env.EMAIL_FROM_ADDRESS,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
  }
)

const emailAdapter = new ServiceEmailAdapter(
  emailService,
  process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com'
)

// 4. Use with existing code
const app = createApp({
  emailAdapter,
  // ... other dependencies
})
```
