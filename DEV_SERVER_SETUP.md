# Development Server Setup

Quick guide to running the webapp locally with hot-reload support.

## Prerequisites

Make sure you've installed dependencies:
```bash
npm install
```

## Running the Dev Servers

### Option 1: Two Terminal Windows (Recommended)

**Terminal 1 — Start API Server:**
```bash
npm run -w @tournament/api dev
```

Expected output:
```
🚀 Starting API server on port 3001...
✅ API server running on http://localhost:3001
📝 Database: db/tournament.db
📡 Frontend: http://localhost:5173
```

**Terminal 2 — Start Frontend Dev Server:**
```bash
npm run -w @tournament/frontend dev
```

Expected output:
```
VITE v5.0.10  ready in 1234 ms

➜  Local:   http://localhost:5173/
➜  press h to show help
```

Then open http://localhost:5173 in your browser.

### Design System Server (Optional)

To view the interactive design system with all components, colors, and theming controls:

**Terminal 3 — Start Design Server:**
```bash
python3 design-server.py 8000
```

Expected output:
```
🎨 Design System Server
📍 http://localhost:8000/design/index.html
📁 Serving: packages/frontend/src/

✨ Press Ctrl+C to stop
```

Then open http://localhost:8000/design/index.html in your browser.

**Features:**
- 🎨 View all design foundations (colors, typography, layout, spacing)
- 🧩 Interactive component library (buttons, forms, cards, etc.)
- 📱 Mobile designs (player and organizer perspectives)
- 🖥️ Desktop organizer tools
- 🌈 Live theme customization:
  - Color palettes (sky, sunset, garden, berry)
  - Dark mode toggle
  - Density settings (cozy, comfort, roomy)
  - Glass effects toggle
  - Role switching (player/organizer)

### Option 2: Single Terminal (Sequential)

```bash
# Build and start API (runs in background)
npm run -w @tournament/api start &

# Start frontend (blocking)
npm run -w @tournament/frontend dev
```

## Environment Variables (Optional)

### Backend (`packages/api/.env`)
```bash
PORT=3001
DATABASE_PATH=db/tournament.db
JWT_SECRET=dev-secret-key-change-in-production
```

### Frontend (`packages/frontend/.env`)
```bash
VITE_API_URL=http://localhost:3001
VITE_DEBUG=false
```

## Features While Developing

### API Server (`npm run -w @tournament/api dev`)
- Watches `packages/api/src/**/*.ts` for changes
- Auto-restarts on file save
- Logs all requests and errors
- Database: Fresh in-memory state on each restart (unless using persistent db)

### Frontend Dev Server (`npm run -w @tournament/frontend dev`)
- Vite dev server with HMR (Hot Module Replacement)
- Instant reload on component changes
- Auto-proxy API requests to `http://localhost:3001`
- Open browser automatically

## Testing While Developing

### Run Tests in Watch Mode
```bash
# All tests
npm test -- --watch

# Specific tests
npm test -- --testPathPattern="Tournament" --watch

# Frontend only
npm test -- packages/frontend --watch

# API only
npm test -- packages/api --watch
```

## Troubleshooting

### Port 3001 Already in Use
```bash
# Find process using port 3001
lsof -i :3001

# Kill it
kill -9 <PID>

# Or use different port
PORT=3002 npm run -w @tournament/api start
```

### Port 5173 Already in Use
```bash
npm run -w @tournament/frontend dev -- --port 5174
```

### Database Issues
```bash
# Reset database (deletes all data)
rm db/tournament.db

# Restart API server - will recreate fresh database
npm run -w @tournament/api start
```

### Module Not Found Errors
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Port 8000 Already in Use (Design Server)
```bash
# Use different port
python3 design-server.py 8001

# Then open http://localhost:8001/design/index.html
```

### Design System Shows Blank Page
```bash
# Verify the server is running and serving files
curl http://localhost:8000/design/index.html | head -20

# Check that all required files are being served
curl http://localhost:8000/styles/tokens.css
curl http://localhost:8000/ui/lib.jsx

# Restart the server
python3 design-server.py 8000
```

## API Endpoints (Available While Dev Servers Running)

### Tournaments
- `POST /tournaments` — Create tournament
- `GET /tournaments` — List all tournaments
- `GET /tournaments/:id` — Get tournament details
- `POST /tournaments/:id/register` — Register for tournament (player)
- `POST /tournaments/:id/advance` — Transition tournament state (organizer)

### Matches & Groups
- `GET /tournaments/:id/matches` — Get all matches
- `POST /tournaments/:id/matches/:matchId/score` — Submit score
- `GET /tournaments/:id/groups/:groupId/standings` — Get group standings

### Real-Time Updates (SSE)
- `GET /tournaments/:id/events` — Subscribe to real-time updates
  - Events: `standings.updated`, `bracket.published`, etc.

## Performance Tips

1. **Keep test watch running in background**
   ```bash
   npm test -- --watch &
   ```

2. **Use browser DevTools**
   - React DevTools extension for component debugging
   - Network tab to monitor API calls
   - Console for error messages

3. **Check API logs**
   - Terminal running API server shows all requests
   - Use `LOG_LEVEL=debug` for verbose logging

4. **Database inspection**
   ```bash
   sqlite3 db/tournament.db
   > .schema
   > SELECT * FROM tournaments LIMIT 5;
   ```

## Example Development Session

```bash
# Terminal 1: API Server with auto-reload
npm run -w @tournament/api dev

# Terminal 2: Tests in watch mode
npm test -- --watch

# Terminal 3: Frontend dev server
npm run -w @tournament/frontend dev

# Terminal 4: Database inspection (optional)
watch -n 1 'sqlite3 db/tournament.db "SELECT count(*) FROM tournaments;"'
```

---

**Status:** ✅ Dev servers configured | **Frontend:** Vite | **Backend:** tsx with hot-reload
