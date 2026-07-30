import path from 'node:path'
import dotenv from 'dotenv'

// Must be the FIRST import in any entrypoint (server.ts, worker-entrypoint.ts).
// This repo is ESM ("type": "module"), so static imports are evaluated before
// the importing file's own top-level code — a same-file `dotenv.config()` call
// runs too late to affect modules (e.g. logger.ts) that read process.env at
// import time, even when the call is written above those imports in source.
dotenv.config({ path: path.resolve(__dirname, '../.env') })
