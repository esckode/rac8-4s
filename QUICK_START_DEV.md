# Quick Start — Development Servers

Get the webapp running locally in **under 1 minute**.

## Prerequisites ✅
Dependencies are already installed. Just run the servers.

## Start the Servers (Two Terminals)

### Terminal 1: Backend API
```bash
npm run -w @tournament/api dev
```

✅ You'll see:
```
🚀 Starting API server on port 3001...
✅ API server running on http://localhost:3001
```

### Terminal 2: Frontend
```bash
npm run -w @tournament/frontend dev
```

✅ You'll see:
```
VITE v5.4.21  ready in 401 ms
➜  Local:   http://localhost:5173/
```

## Open in Browser

**👉 Go to: http://localhost:5173**

## What You Can Do

✅ Create tournaments  
✅ Register players (magic link auth)  
✅ Submit match scores  
✅ View real-time standings  
✅ See bracket generation  
✅ Test responsive design  

## Hot Reload

Both servers support live reload:
- **Frontend:** Edit any `.tsx` file → Auto-refresh in browser
- **Backend:** Edit any `.ts` file → Auto-restart on save

## If Something Breaks

### Reset Database
```bash
rm db/tournament.db
# API will recreate it on next start
```

### Port Already in Use
```bash
# Find what's running on port 3001
lsof -i :3001
kill -9 <PID>

# Or use a different port
PORT=3002 npm run -w @tournament/api dev
```

### Clear Everything
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

## Run Tests While Developing

In a **3rd terminal** (while servers are running):
```bash
npm test -- --watch
```

---

**That's it!** 🎉 You now have a fully functional dev environment with hot reload.
