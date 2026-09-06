// Connexion Telegram : tout ce qui touche à MTProto vit ici, pour que
// l'ingestion ne dépende ni du transport ni du stockage.
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

export async function connect(env) {
  const client = new TelegramClient(
    new StringSession(env.TG_SESSION || ''),
    Number(env.TG_API_ID), env.TG_API_HASH,
    { connectionRetries: 5, useWSS: true },
  )
  await client.connect()
  return client
}

/** Les salons visibles depuis ce compte — canaux et groupes uniquement. */
export async function listDialogs(client, limit = 300) {
  const out = []
  for (const d of await client.getDialogs({ limit })) {
    if (!d.isChannel && !d.isGroup) continue
    const e = d.entity
    out.push({
      chatId: e?.id?.toString?.() ?? '',
      title: d.title ?? '(sans titre)',
      username: e?.username ?? null,
      kind: d.isChannel ? 'channel' : 'group',
      participants: e?.participantsCount ?? null,
    })
  }
  return out
}

/**
 * Un salon peut être désigné par son @username ou par son id numérique.
 * Le cache évite une résolution réseau à chaque message reçu.
 */
export function makeResolver(client) {
  const cache = new Map()
  return async function resolve(salon) {
    const key = salon.username || salon.chatId
    if (cache.has(key)) return cache.get(key)
    const ref = salon.username ? String(salon.username).replace(/^@/, '') : BigInt(salon.chatId)
    const entity = await client.getEntity(ref)
    cache.set(key, entity)
    return entity
  }
}

/** L'id de salon d'un message entrant, quelle que soit sa forme de peer. */
export function chatIdOf(msg) {
  return String(msg.peerId?.channelId ?? msg.peerId?.chatId ?? msg.chatId ?? '')
}
