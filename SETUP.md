# Setup & Installation Guide

Get the tournament management system running in < 30 minutes.

## Prerequisites

- **Node.js**: 18+ (use `nvm` or download from nodejs.org)
- **npm**: 8+ (comes with Node.js)
- **Git**: For cloning the repository

Verify installation:
```bash
node --version  # Should be 18+
npm --version   # Should be 8+
git --version
```

## Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd tournament-app
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Dependencies are installed for all packages:
# - packages/api
# - packages/frontend
# - packages/core-logic
# - packages/worker
# - shared
```

### 3. Verify Installation
```bash
npm test

# Expected output:
# Test Suites: 62 passed, 62 total
# Tests:       1302 passed, 1302 total
```

## Environment Variables

### Frontend (packages/frontend/.env)
```bash
# API endpoint (optional, defaults to localhost:3001)
VITE_API_URL=http://localhost:3001

# Debug mode (optional)
VITE_DEBUG=false
```

### Backend (packages/api/.env)
```bash
# Server port
PORT=3001

# Database path (relative to project root)
DATABASE_PATH=db/tournament.db

# JWT configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# Email service (optional for development)
EMAIL_SERVICE=none  # Set to 'sendgrid' or 'mailgun' in production
EMAIL_FROM=noreply@tournament.app

# Analytics
ANALYTICS_ENABLED=true

# Environment
NODE_ENV=development  # Use 'production' for production deployments
```

## Running the Application

### Option 1: Development Mode (Two Terminals)

**Terminal 1 - Backend API:**
```bash
cd packages/api
npm install  # If not already done
npm start

# Expected output:
# Server running on http://localhost:3001
# Connected to database at db/tournament.db
```

**Terminal 2 - Frontend:**
```bash
cd packages/frontend
npm install  # If not already done
npm run dev

# Expected output:
# Local:   http://localhost:5173
# Open this URL in your browser
```

### Option 2: Production Mode

```bash
# Build frontend
cd packages/frontend
npm run build

# Build backend
cd ../api
npm run build

# Start backend (from root)
cd ../..
npm start

# Access at http://localhost:3001
```

## Database Setup

### Initialize Database
The database is automatically initialized on first run:
1. SQLite creates `db/tournament.db` if it doesn't exist
2. Migrations run automatically at startup
3. Tables created: tournaments, players, groups, matches, standings, user_events

### Manual Migration (if needed)
```bash
# Migrations are in db/migrations/
# They run automatically, but to manually check:
sqlite3 db/tournament.db ".schema"
```

### Reset Database
```bash
# Delete the database file (will be recreated on next run)
rm db/tournament.db

# Then restart the application
```

## Running Tests

### Run All Tests
```bash
npm test

# Options:
# npm test -- --watch              # Watch mode
# npm test -- --coverage           # With coverage report
# npm test -- --testPathPattern="StandingsTable"  # Specific test
```

### Run Tests by Package
```bash
# Frontend tests only
npm test -- packages/frontend

# API tests only
npm test -- packages/api

# Core logic tests only
npm test -- packages/core-logic
```

### Test Coverage
```bash
npm test -- --coverage

# Coverage report will show:
# - Statement coverage
# - Branch coverage
# - Function coverage
# - Line coverage
```

## Linting & Type Checking

### Type Check
```bash
npm run type-check

# Check specific package:
npm run type-check -- packages/frontend
```

### Lint Code
```bash
npm run lint

# Fix lint errors automatically:
npm run lint:fix
```

## Development Workflow

### Creating a New Feature

1. **Create a test first** (TDD approach)
   ```bash
   # Create file: packages/frontend/src/components/NewComponent.spec.tsx
   # Write tests for expected behavior
   ```

2. **Implement the component**
   ```typescript
   // Create: packages/frontend/src/components/NewComponent.tsx
   // Make tests pass
   ```

3. **Run tests to verify**
   ```bash
   npm test -- --testPathPattern="NewComponent"
   ```

4. **Check types and lint**
   ```bash
   npm run type-check
   npm run lint
   ```

### Debugging

**Frontend**
- Open browser DevTools (F12)
- React DevTools extension (recommended)
- Check Network tab for API calls
- Console shows any errors or warnings

**Backend**
- Check terminal output for API logs
- Set `DEBUG=*` environment variable for verbose logging
- Use VS Code debugger: Run → Start Debugging

**Database**
```bash
# Inspect database schema
sqlite3 db/tournament.db ".schema"

# Query data
sqlite3 db/tournament.db "SELECT * FROM tournaments LIMIT 5;"

# Use graphical tool (optional):
# https://sqlitebrowser.org/
```

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process on port 3001
lsof -i :3001
kill -9 <PID>

# Or use different port:
PORT=3002 npm start
```

### Node Version Mismatch
```bash
# Use nvm to switch Node version
nvm install 18
nvm use 18
```

### npm install Fails
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Tests Failing
```bash
# Clear Jest cache
npm test -- --clearCache

# Run specific test with verbose output
npm test -- --testPathPattern="Tournament" --verbose
```

### Database Corruption
```bash
# Delete and recreate database
rm db/tournament.db
npm start

# Application will reinitialize the database
```

## Performance Testing

### Build Size Analysis
```bash
cd packages/frontend
npm run build

# Check dist/ folder size
ls -lh dist/
```

### Performance Metrics
```bash
# Run performance verification
npm test -- --testPathPattern="Standings.*virtualization"

# Check results in PERFORMANCE_VALIDATION_RESULTS.md
```

## Production Deployment

### Pre-Deployment Checklist
- [ ] All tests passing: `npm test`
- [ ] No TypeScript errors: `npm run type-check`
- [ ] No lint errors: `npm run lint`
- [ ] Environment variables set correctly
- [ ] Database has recent backup

### Deploy Steps

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Set production environment variables**
   ```bash
   export NODE_ENV=production
   export JWT_SECRET=<strong-secret>
   export DATABASE_PATH=/data/tournament.db  # Persistent location
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Verify deployment**
   ```bash
   # Check health endpoint
   curl http://localhost:3001/health
   ```

### Monitoring

**Health Checks**
```bash
# Basic health check
curl http://localhost:3001/health

# Database status
curl http://localhost:3001/api/status
```

**Logs**
- Check `/var/log/tournament-app.log` for application logs
- Use log aggregation service (ELK, Datadog, etc.) for production

**Analytics**
- Query user_events table: See ANALYTICS_QUERIES.md
- Monitor performance metrics in ANALYTICS.md
- Set up alerts for slow queries or errors

## Getting Help

### Documentation
- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Features**: See [FEATURES.md](./FEATURES.md)
- **Testing**: See [TESTING.md](./TESTING.md)
- **Analytics**: See [ANALYTICS.md](./ANALYTICS.md)

### Common Issues
1. Check application logs first
2. Review relevant documentation file
3. Run `npm test` to verify functionality
4. Check Git history for recent changes

### Development Tips
- Use `npm run dev` for hot-reloading frontend
- Use VS Code debugger for backend
- Keep one terminal for tests in watch mode: `npm test -- --watch`
- Use TypeScript strict mode to catch errors early

---

**Estimated Setup Time:** 10-15 minutes  
**Status:** ✅ Ready for development
