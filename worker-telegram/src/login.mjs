// Ouvre une session Telegram et imprime la chaîne à coller dans TG_SESSION.
// À lancer une seule fois, en interactif : `npm run login`.
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import input from 'input'
import { readEnv } from './env.mjs'

const env = readEnv(['TG_API_ID', 'TG_API_HASH'])
const client = new TelegramClient(new StringSession(''), Number(env.TG_API_ID), env.TG_API_HASH, { connectionRetries: 5 })

await client.start({
  phoneNumber: () => input.text('Numéro de téléphone (format +33…) : '),
  password: () => input.text('Mot de passe 2FA (vide si aucun) : '),
  phoneCode: () => input.text('Code reçu sur Telegram : '),
  onError: e => console.error(e),
})

console.log('\n─────────────────────────────────────────────────────────')
console.log('Colle ceci dans .env → TG_SESSION= (garde-le secret) :\n')
console.log(client.session.save())
console.log('─────────────────────────────────────────────────────────\n')

// Liste les salons visibles : sert à remplir la page Talents → Salons.
const dialogs = await client.getDialogs({ limit: 200 })
console.log('Salons visibles depuis ce compte :\n')
for (const d of dialogs) {
  if (!d.isChannel && !d.isGroup) continue
  const id = d.entity?.id?.toString?.() ?? ''
  const uname = d.entity?.username ? '@' + d.entity.username : '—'
  console.log(`  ${id.padEnd(16)} ${uname.padEnd(24)} ${d.title}`)
}
await client.disconnect()
process.exit(0)
