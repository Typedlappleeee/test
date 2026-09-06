// Lecture de .env sans dépendance (Node 20 : --env-file existe, mais on veut
// que `node src/index.mjs` marche sans flag).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function readEnv(required = []) {
  const file = join(root, '.env')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m) continue
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (process.env[m[1]] === undefined) process.env[m[1]] = v
    }
  }
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    console.error(`\nVariables manquantes dans worker-telegram/.env : ${missing.join(', ')}`)
    console.error('Pars de .env.example et relis worker-telegram/README.md.\n')
    process.exit(1)
  }
  return process.env
}
