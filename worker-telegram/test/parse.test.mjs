// Tests du parseur sur des annonces réelles (formats rencontrés en salon).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseListing, dedupeKey, parseMoney, parseHours, parseBool } from '../../shared/talents/parse.mjs'
import { hardFilter, trainModel, scoreListing, featuresOf } from '../../shared/talents/score.mjs'

const OFMARKET = `🌟 Model Listing 🌟

📋 Listing ID #8260

🎂 Age: 23
🌍 Origin: Chile
💰 Salary Range: 1000 + increases

📝 Details:
🗣 English Level: 4
⏰ Time per Day: 4hs
🎬 Content Type: Explicit content, masturbation, dildo and fingers
📱 Smartphone: iPhone 13
🔐 Account Access: No
📲 Social Media: New accounts
🎞 TikTok/IG Reels: Yes
🌐 OnlyFans: Yes
💳 Skrill: Yes
🏢 Is currently working with an agency?: No
🚀 Can Start: ASAP
🚫 Blocked Countries: Chile

ℹ️ Additional Info:
Professional model available

💰 Price: $1100.00
✅ Warranty: 7
🧑 Middleman: @henri77`

test('annonce ofmarket : tous les champs canoniques', () => {
  const { fields, isListing, confidence } = parseListing(OFMARKET)
  assert.equal(fields.listing_id, '8260')
  assert.equal(fields.age, 23)
  assert.equal(fields.origin, 'Chile')
  assert.equal(fields.english_level, 4)
  assert.equal(fields.hours_per_day.hours, 4)
  assert.equal(fields.price.amount, 1100)
  assert.equal(fields.price.currency, 'USD')
  assert.equal(fields.salary.amount, 1000)
  assert.equal(fields.onlyfans, true)
  assert.equal(fields.with_agency, false)
  assert.equal(fields.account_access, false)
  assert.equal(fields.middleman, '@henri77')
  assert.equal(fields.warranty, 7)
  assert.deepEqual(fields.blocked_countries, ['Chile'])
  assert.deepEqual(fields.payment, ['Skrill'])
  assert.equal(fields.additional_info, 'Professional model available')
  assert.ok(fields.content_types.includes('masturbation'))
  assert.equal(isListing, true)
  assert.ok(confidence > 0.8)
})

test('format espagnol, libellés différents', () => {
  const { fields, isListing } = parseListing(`MODELO DISPONIBLE
Edad: 21
País: Colombia
Nivel de inglés: 2
Precio: 750 USD
Horas por día: 6
¿Trabaja con agencia?: No`)
  assert.equal(fields.age, 21)
  assert.equal(fields.origin, 'Colombia')
  assert.equal(fields.english_level, 2)
  assert.equal(fields.price.amount, 750)
  assert.equal(fields.hours_per_day.hours, 6)
  assert.equal(isListing, true)
})

test('message hors sujet : rejeté', () => {
  for (const t of ['Salut les gars, quelqu\'un a des nouvelles ?', 'Join our channel: t.me/xxx', '']) {
    assert.equal(parseListing(t).isListing, false, t)
  }
})

test('champs inconnus conservés au lieu d\'être perdus', () => {
  const { unknown } = parseListing(`Age: 24\nOrigin: Brazil\nPrice: $900\nShoe size: 38`)
  assert.equal(unknown['shoe size'], '38')
})

test('montants dans tous les formats', () => {
  assert.equal(parseMoney('$1100.00').amount, 1100)
  assert.equal(parseMoney('1.200,50 EUR').amount, 1200.5)
  assert.equal(parseMoney('1,200.50').amount, 1200.5)
  assert.equal(parseMoney('1.2k').amount, 1200)
  assert.equal(parseMoney('à négocier').amount, null)
  assert.equal(parseMoney('£800').currency, 'GBP')
})

test('heures et booléens', () => {
  assert.equal(parseHours('4hs').hours, 4)
  assert.equal(parseHours('6-8 hours/day').hours, 6)
  assert.equal(parseBool('Yes'), true)
  assert.equal(parseBool('non'), false)
  assert.equal(parseBool('peut-être'), null)
})

test('dédoublonnage : même annonce, deux salons → même clé', () => {
  const a = parseListing(OFMARKET)
  const b = parseListing(OFMARKET.replace('🌟 Model Listing 🌟', '💎 NEW MODEL 💎'))
  assert.equal(dedupeKey(a.fields, a.raw), dedupeKey(b.fields, b.raw))
})

test('dédoublonnage sans listing_id : signature des caractéristiques', () => {
  const a = parseListing('Age: 22\nOrigin: Peru\nPrice: $600\nEnglish Level: 3')
  const b = parseListing('Edad: 22\nPaís: Peru\nPrecio: $600\nNivel de inglés: 3')
  assert.equal(dedupeKey(a.fields, a.raw), dedupeKey(b.fields, b.raw))
  const c = parseListing('Age: 29\nOrigin: Peru\nPrice: $600\nEnglish Level: 3')
  assert.notEqual(dedupeKey(a.fields, a.raw), dedupeKey(c.fields, c.raw))
})

test('filtres durs : chaque règle donne sa raison', () => {
  const { fields } = parseListing(OFMARKET)
  assert.deepEqual(hardFilter(fields, { max_price: 2000 }), [])
  assert.match(hardFilter(fields, { max_price: 900 })[0], /budget/)
  assert.match(hardFilter(fields, { min_english: 5 })[0], /Anglais/)
  assert.match(hardFilter(fields, { blocked_countries: ['CHILE'] })[0], /Origine/)
  assert.match(hardFilter(fields, { min_hours: 6 })[0], /h\/j/)
  assert.equal(hardFilter(fields, { exclude_with_agency: true }).length, 0)
})

test('score : muet sous le seuil, actif au-dessus', () => {
  const liked = { age: 22, origin: 'Colombia', price: { amount: 800 }, english_level: 4 }
  const disliked = { age: 33, origin: 'Russia', price: { amount: 2400 }, english_level: 1 }
  const few = [...Array(4)].map(() => ({ fields: liked, decision: 'match' }))
  assert.equal(scoreListing(liked, trainModel(few)).ready, false)

  const many = [
    ...[...Array(15)].map(() => ({ fields: liked, decision: 'match' })),
    ...[...Array(15)].map(() => ({ fields: disliked, decision: 'pass' })),
  ]
  const model = trainModel(many)
  const good = scoreListing(liked, model)
  const bad = scoreListing(disliked, model)
  assert.equal(good.ready, true)
  assert.ok(good.score > bad.score, `${good.score} devrait dépasser ${bad.score}`)
  assert.ok(good.top.length > 0)
})

test('traits : une annonce vide n\'en produit aucun', () => {
  assert.deepEqual(featuresOf({}), [])
})
