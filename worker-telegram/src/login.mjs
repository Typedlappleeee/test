// Connexion Telegram, une fois pour toutes.
//
//   npm run login
//
// Demande ce qui manque, ouvre la session, et écrit tout dans .env. Aucun
// copier-coller : à la fin, `npm start` suffit.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import input from 'input'
import { readEnv } from './env.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env')

/** Écrit une variable dans .env sans écraser le reste du fichier. */
function setEnv(key, value) {
  let txt = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  const line = `${key}=${value}`
  txt = new RegExp('^' + key + '=.*$', 'm').test(txt)
    ? txt.replace(new RegExp('^' + key + '=.*$', 'm'), line)
    : (txt.trimEnd() + '\n' + line + '\n').trimStart()
  writeFileSync(ENV_FILE, txt)
}

readEnv()

console.log('')
console.log('  \x1b[35m▸ Connexion Telegram\x1b[0m')
console.log('')

if (!process.env.TG_API_ID || !process.env.TG_API_HASH) {
  console.log('  Il te faut un api_id et un api_hash, gratuits et immédiats :')
  console.log('  \x1b[4mhttps://my.telegram.org\x1b[0m → API development tools → crée une application.')
  console.log('  (N’importe quel nom convient. Ce sont TES identifiants d’application, pas ceux d’un bot.)')
  console.log('')
  const id = (await input.text('  api_id : ')).trim()
  const hash = (await input.text('  api_hash : ')).trim()
  if (!id || !hash) { console.error('\n  api_id et api_hash sont obligatoires.\n'); process.exit(1) }
  setEnv('TG_API_ID', id)
  setEnv('TG_API_HASH', hash)
  process.env.TG_API_ID = id
  process.env.TG_API_HASH = hash
  console.log('')
}

const { TelegramClient } = await import('telegram')
const { StringSession } = await import('telegram/sessions/index.js')

const client = new TelegramClient(new StringSession(''), Number(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 5 })

await client.start({
  phoneNumber: () => input.text('  Ton numéro (format +33…) : '),
  phoneCode: () => input.text('  Code reçu sur Telegram : '),
  password: () => input.text('  Mot de passe 2FA (Entrée si aucun) : '),
  onError: e => console.error('  ' + e.message),
})

setEnv('TG_SESSION', client.session.save())

const me = await client.getMe()
let n = 0
for (const d of await client.getDialogs({ limit: 300 })) if (d.isChannel || d.isGroup) n++
await client.disconnect()

console.log('')
console.log('  \x1b[32m✓\x1b[0m Connecté en tant que ' + (me.username ? '@' + me.username : me.firstName) + '.')
console.log('  \x1b[32m✓\x1b[0m Session enregistrée dans .env — garde ce fichier privé, il vaut ton mot de passe.')
console.log('  ' + n + ' salons visibles depuis ce compte ; tu les choisiras dans l’interface.')
console.log('')
console.log('  Lance maintenant : \x1b[35mnpm start\x1b[0m')
console.log('')
process.exit(0)
