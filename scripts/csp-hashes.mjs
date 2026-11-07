// Prints the 'sha256-...' numbers for the small scripts written inside
// index.html. public/_headers lists them in script-src. Run it after
// changing one of those scripts:
//   npm run build
//   node scripts/csp-hashes.mjs
// Then put the printed numbers in public/_headers in place of the old ones.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const found = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
if (found.length === 0) console.log('No scripts written inside index.html.')
for (const m of found) {
  console.log("'sha256-" + createHash('sha256').update(m[1], 'utf8').digest('base64') + "'")
}
