// Annonces d'exemple pour `--demo` : fabriquées, au format réel des salons.
// Elles ne représentent personne et ne portent aucune photo.
const COUNTRIES = ['Chile','Colombia','Argentina','Brazil','Mexico','Venezuela','Peru','Spain','Poland','Romania','Czechia','Portugal']
const CONTENT = [
  'Explicit content, masturbation, dildo and fingers',
  'Softcore, lingerie, teasing',
  'Explicit content, toys, roleplay',
  'Solo content only, no explicit',
]
const MM = ['henri77', 'lucas_mm', 'sofia_deals', 'broker_ana']

export function sampleText(i) {
  const age = 19 + (i * 5) % 15
  const country = COUNTRIES[i % COUNTRIES.length]
  const price = 380 + ((i * 317) % 2300)
  const salary = 600 + ((i * 211) % 1900)
  return `🌟 Model Listing 🌟

📋 Listing ID #${8200 + i}

🎂 Age: ${age}
🌍 Origin: ${country}
💰 Salary Range: ${salary} + increases

📝 Details:
🗣 English Level: ${1 + (i % 5)}
⏰ Time per Day: ${2 + (i % 7)}hs
🎬 Content Type: ${CONTENT[i % CONTENT.length]}
📱 Smartphone: iPhone ${11 + (i % 4)}
🔐 Account Access: ${i % 3 === 0 ? 'Yes' : 'No'}
📲 Social Media: New accounts
🎞 TikTok/IG Reels: ${i % 4 === 0 ? 'No' : 'Yes'}
🌐 OnlyFans: ${i % 5 === 0 ? 'No' : 'Yes'}
💳 Skrill: Yes
🏢 Is currently working with an agency?: ${i % 6 === 0 ? 'Yes' : 'No'}
🚀 Can Start: ${i % 2 ? 'ASAP' : 'Next week'}
🚫 Blocked Countries: ${country}

ℹ️ Additional Info:
Professional model available

💰 Price: $${price}.00
✅ Warranty: ${3 + (i % 12)}
🧑 Middleman: @${MM[i % MM.length]}`
}
