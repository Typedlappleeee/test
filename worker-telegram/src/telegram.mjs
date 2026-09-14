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
  const byId = new Map()
  let dialogsLoaded = null

  /**
   * `getEntity(1234)` sur un identifiant nu ne dit pas de quel type d'objet il
   * s'agit : Telegram le cherche parmi les utilisateurs et échoue sur un canal
   * (« Could not find the input entity … PeerUser »). Parcourir les dialogues
   * une fois donne l'entité complète — access hash compris — et remplit au
   * passage le cache de session dont dépendent les appels suivants.
   */
  function loadDialogs() {
    if (!dialogsLoaded) {
      dialogsLoaded = client.getDialogs({ limit: 500 }).then(ds => {
        for (const d of ds) if (d.entity?.id != null) byId.set(String(d.entity.id), d.entity)
        return byId
      }).catch(e => { dialogsLoaded = null; throw e })
    }
    return dialogsLoaded
  }

  return async function resolve(salon) {
    const key = salon.username || salon.chatId
    if (cache.has(key)) return cache.get(key)

    await loadDialogs()
    let entity = byId.get(String(salon.chatId))

    // Salon rejoint après le démarrage du worker : la liste en cache ne le
    // connaît pas encore. On la relit une fois avant d'abandonner.
    if (!entity) {
      dialogsLoaded = null
      await loadDialogs()
      entity = byId.get(String(salon.chatId))
    }

    // Un salon public reste joignable par son @username même s'il ne figure
    // pas dans les dialogues (compte qui vient de le rejoindre, liste tronquée).
    if (!entity && salon.username) {
      try { entity = await client.getEntity(String(salon.username).replace(/^@/, '')) } catch { /* dernier recours ci-dessous */ }
    }
    if (!entity) entity = await client.getEntity(BigInt(salon.chatId))

    cache.set(key, entity)
    return entity
  }
}

/** L'id de salon d'un message entrant, quelle que soit sa forme de peer. */
export function chatIdOf(msg) {
  return String(msg.peerId?.channelId ?? msg.peerId?.chatId ?? msg.chatId ?? '')
}

/**
 * Les salons où ce compte peut écrire : destinations possibles d'un transfert.
 * « Messages enregistrés » (la conversation avec soi-même) vient en tête —
 * c'est la seule destination à risque strictement nul.
 */
export async function listTargets(client, limit = 300) {
  const me = await client.getMe()
  const out = [{
    chatId: String(me.id), title: 'Messages enregistrés (moi-même)',
    username: me.username ?? null, kind: 'self',
  }]
  for (const d of await client.getDialogs({ limit })) {
    const e = d.entity
    if (!e?.id) continue
    if (d.isUser) continue                                   // pas d'envoi à des tiers
    // Un canal en lecture seule n'accepte pas de message : on ne le propose pas.
    if (e.className === 'Channel' && e.broadcast && !e.creator && !e.adminRights) continue
    if (e.left || e.restricted) continue
    out.push({
      chatId: e.id.toString(), title: d.title ?? '(sans titre)',
      username: e.username ?? null,
      kind: e.className === 'Channel' ? (e.broadcast ? 'channel' : 'group') : 'group',
    })
  }
  return out
}

/**
 * Transfère les messages d'une annonce vers une destination.
 *
 * Le transfert natif conserve les photos et la mention du salon d'origine. Il
 * échoue quand le salon source protège son contenu (`noforwards`) : on retombe
 * alors sur une copie — texte et photos réenvoyés depuis le disque —, ce qui
 * perd l'attribution mais fait arriver l'annonce.
 */
export async function forwardListing(client, { fromEntity, toEntity, msgIds, fallbackText, fallbackFiles }) {
  try {
    await client.forwardMessages(toEntity, { messages: msgIds, fromPeer: fromEntity })
    return { mode: 'forward' }
  } catch (e) {
    const protectedContent = /forward|noforward|protect|COPY/i.test(e.message || '')
    if (!protectedContent && !fallbackText) throw e
    if (fallbackFiles?.length) {
      await client.sendFile(toEntity, { file: fallbackFiles, caption: fallbackText, parseMode: undefined })
    } else {
      await client.sendMessage(toEntity, { message: fallbackText })
    }
    return { mode: 'copy', why: e.message }
  }
}
