# Talents — sourcing de modèles depuis Telegram

Comment le système fonctionne, pourquoi il est découpé ainsi, et ce qu'il faut
faire pour le mettre en service.

---

## 1. Le problème, décomposé

Récupérer des annonces d'une marketplace Telegram et les trier tient en quatre
questions indépendantes. Les traiter séparément est ce qui rend le reste simple.

| Question | Réponse retenue | Pourquoi pas autrement |
|---|---|---|
| Comment **lire** un salon dont on n'est que membre ? | Client MTProto avec un compte utilisateur (GramJS) | Un bot doit être ajouté au salon — impossible sur une marketplace tierce |
| Comment **comprendre** un message ? | Parseur libellé → champ, avec dictionnaire d'alias multilingue | Une regex par salon devient ingérable au troisième salon |
| Comment **ne pas voir deux fois** la même fille ? | Clé de dédoublonnage + contrainte d'unicité en base | Un filtrage côté app laisse passer les courses entre workers |
| Comment **trier** ? | Filtres durs (explicites) + score appris (ordonne) | Un seul mécanisme mélangerait « je n'en veux pas » et « j'aime moins » |

---

## 2. L'architecture

```
   Salons Telegram
        │  MTProto, compte utilisateur, lecture seule
        ▼
┌────────────────────┐
│  worker-telegram/  │  Node, sur ton VPS. Détient les secrets Telegram.
│                    │  Regroupe les albums, parse, télécharge les photos.
└─────────┬──────────┘
          │  clé service_role
          ▼
┌────────────────────┐
│     Supabase       │  talent_salons · talent_listings · talent_decisions
│                    │  talent_favorites · talent_prefs · bucket `talents`
└─────────┬──────────┘
          │  RLS par organisation, session du user
          ▼
┌────────────────────┐
│  App ScaleFlow     │  Page Talents : deck, favoris, salons, filtres.
│  src/pages/Talents │  Ne connaît pas Telegram.
└────────────────────┘

     shared/talents/  ← parseur + scoring, importés par le worker ET par l'app
```

**Le point qui compte** : l'app ne parle jamais à Telegram. Les identifiants
Telegram donnent un accès complet au compte ; les mettre dans une application
Electron distribuée à des clients, ce serait les distribuer. Le worker est le
seul à les détenir, et il tourne là où tu contrôles la machine.

Corollaire pratique : **si le worker ne tourne pas, rien n'arrive**. C'est un
service à surveiller, pas une fonctionnalité de l'app.

---

## 3. Le parseur

`shared/talents/fields.mjs` + `parse.mjs`.

Une annonce type ressemble à ceci :

```
🌟 Model Listing 🌟
📋 Listing ID #8260
🎂 Age: 23
🌍 Origin: Chile
💰 Salary Range: 1000 + increases
🗣 English Level: 4
⏰ Time per Day: 4hs
🌐 OnlyFans: Yes
💰 Price: $1100.00
🧑 Middleman: @henri77
```

Le parseur travaille ligne par ligne :

1. Retire les emojis, normalise le libellé (minuscules, sans accents).
2. Cherche ce libellé dans le dictionnaire d'alias → un champ canonique.
3. Convertit la valeur selon le **type** du champ : `$1100.00` → `{amount: 1100,
   currency: 'USD'}`, `4hs` → `4 heures`, `Yes` → `true`, une énumération → un
   tableau.
4. Ce qu'il ne reconnaît pas va dans `unknown` — jamais jeté, consultable dans
   l'app, et c'est ce qui te dit quels alias ajouter.

Trois détails qui font la différence en usage réel :

- **`Skrill: Yes`** : le libellé *est* le moyen de paiement, la valeur dit s'il
  est accepté. Le parseur enregistre `payment: ['Skrill']`, pas `['Yes']`.
- **Sections** : `Additional Info:` seul sur sa ligne ouvre une section — les
  lignes suivantes sans libellé lui appartiennent.
- **Confiance** : une annonce qui ne fournit pas au moins deux champs
  significatifs part en `review` plutôt que dans le deck. Un salon dont tous
  les messages atterrissent là est un format à ajouter, pas un bug.

Ajouter le support d'un salon = ajouter des alias dans `fields.mjs` + un cas dans
`worker-telegram/test/parse.test.mjs`. Rien d'autre.

### Dédoublonnage

La même fille est repostée dans plusieurs salons, souvent avec un en-tête
différent. La clé, par ordre de préférence :

1. `listing_id` quand le salon en fournit un (`#8260`) — le plus fiable ;
2. sinon une signature des caractéristiques (âge, origine, prix, salaire,
   niveau d'anglais) + le hash de la première photo — invariantes d'un repost à
   l'autre ;
3. sinon le hash du texte normalisé.

Cette clé est une **contrainte d'unicité en base**, pas un test côté worker :
deux workers concurrents ne peuvent pas créer de doublon même en course. Un
doublon détecté n'est pas jeté — il enrichit `seen_in`, et la carte affiche
« vue dans 3 salons », ce qui est une information de négociation.

---

## 4. Le tri automatique : deux mécanismes séparés

### Les filtres durs — tu les écris, ils retirent

`talent_prefs`, onglet Filtres. Budget max, âge, niveau d'anglais minimum, pays
exclus, exiger OnlyFans, exclure celles déjà en agence. Une annonce qui viole une
règle prend le statut `filtered` **à l'ingestion**, avec la raison, et n'entre
jamais dans le deck. Elle reste consultable — c'est le seul moyen de vérifier que
tes règles ne sont pas trop serrées.

Une conséquence à connaître : modifier les filtres n'affecte que les annonces à
venir. Les annonces déjà en base gardent le statut calculé à leur arrivée.

### Le score d'affinité — il s'apprend, il ordonne

`shared/talents/score.mjs`. Chaque annonce devient un sac de traits discrets
(`origin=chile`, `price=1000-1500`, `age=21-24`, `en=4`, `of=true`…). Un Bayes
naïf lissé compare la fréquence de chaque trait chez tes matchs et chez tes pass,
et en tire une probabilité que tu matches.

Trois choix délibérés :

- **Il n'écarte rien.** Il ne fait que remonter les annonces qui te ressemblent.
  Un modèle qui supprime finit par te cacher ce qu'il a mal appris.
- **Il se tait sous 20 décisions.** Un modèle entraîné sur cinq swipes est du
  bruit ; afficher un score donnerait un faux sentiment de tri. En dessous, le
  deck reste chronologique.
- **Il est explicable.** Le badge d'affinité affiche au survol les trois traits
  qui pèsent le plus, et l'onglet Filtres montre ce que le modèle a retenu. Un
  score opaque qu'on ne peut pas corriger est un score qu'on finit par ignorer.

Pas de réseau de neurones, pas d'appel API : quelques dizaines de lignes qui
tournent dans le navigateur et se réentraînent à chaque swipe.

---

## 5. Match or pass

Le deck empile les annonces non encore tranchées. Trois issues :

| Geste | Clavier | Effet |
|---|---|---|
| Glisser à droite | `→` | **Match** → entre en favoris, étape « À contacter » |
| Glisser à gauche | `←` | **Pass** → sort du deck, nourrit le modèle |
| Glisser vers le bas | `↓` | **Plus tard** → reviendra dans le deck |

Le clavier existe parce que c'est l'usage réel : trier 200 annonces à la souris
est un supplice. `Annuler` revient sur la dernière décision.

Une décision est une **ligne unique par (annonce, utilisateur)** : re-swiper met
à jour au lieu d'empiler, et l'historique reste exploitable. Chacun swipe pour
soi ; le favori, lui, appartient à l'organisation — dès qu'un membre matche, le
dossier existe pour toute l'équipe.

Cette bascule est un **trigger SQL**, pas du code applicatif : un match crée la
ligne de favori, un pass la retire si personne d'autre ne l'a matchée et que le
dossier n'est pas déjà engagé. L'app n'a qu'un seul écrit à faire par swipe, et
les deux états ne peuvent pas diverger.

---

## 6. Les favoris

Un pipeline de recrutement à cinq étapes : *À contacter → Contactée → En négo →
Signée → Perdue*, avec une note libre par dossier. C'est volontairement modeste :
le suivi utile ici tient dans un statut et deux lignes de contexte.

---

## 7. Mise en service

1. **Base** — joue `supabase/talents.sql` dans le SQL editor Supabase. Il crée
   les cinq tables, les RLS par organisation, les triggers et le bucket de
   photos. Il est idempotent.
2. **Worker** — suis `worker-telegram/README.md` (api_id/api_hash, `npm run
   login`, clé service_role, ORG_ID).
3. **Salons** — dans l'app, Talents → Salons → Ajouter, avec le `@username` ou
   l'identifiant numérique que `npm run login` a listé.
4. **Rattrapage** — `npm run backfill` dans `worker-telegram/` : il ingère
   l'historique récent, puis reste en écoute.
5. **Filtres** — règle ton budget et tes exclusions dans l'onglet Filtres avant
   le premier backfill, sinon tout arrive dans le deck.

### Voir l'écran sans rien brancher

```bash
npm run preview:talents
```

Ouvre la page avec 48 annonces fabriquées qui passent par le **vrai** parseur, les
vrais filtres et le vrai scoring. C'est aussi le moyen le plus rapide d'éprouver
le parseur sur un nouveau format : colle un message réel dans `preview/talents.tsx`
et recharge.

---

## 8. Ce que le système ne fait pas

À savoir avant de compter dessus :

- **Pas de reconnaissance d'image.** Le dédoublonnage compare des hashs exacts :
  la même photo recompressée par un autre salon passe pour différente. La
  signature des caractéristiques rattrape la plupart de ces cas, pas tous. Un
  hash perceptuel (pHash) serait la suite logique.
- **Pas de contact automatique.** Le middleman est affiché, l'écriture reste
  manuelle — automatiser les messages sur Telegram est le meilleur moyen de faire
  bannir le compte.
- **Pas de vérification d'identité ni d'âge.** Les champs sont ceux du vendeur.
  Le filtre `min_age` porte sur du texte déclaratif, il ne prouve rien.
- **Pas de temps réel dans l'app.** La page charge à l'ouverture ; le bouton
  Rafraîchir relit. Brancher Supabase Realtime sur `talent_listings` serait
  quelques lignes le jour où ça manque.

---

## 9. Où est quoi

| Fichier | Rôle |
|---|---|
| `shared/talents/fields.mjs` | Dictionnaire des libellés → champs canoniques |
| `shared/talents/parse.mjs` | Parseur + dédoublonnage |
| `shared/talents/score.mjs` | Filtres durs + score appris |
| `supabase/talents.sql` | Tables, RLS, triggers, bucket photos |
| `worker-telegram/src/index.mjs` | Écoute Telegram, regroupe les albums |
| `worker-telegram/src/store.mjs` | Écriture Supabase, upload des photos |
| `worker-telegram/test/parse.test.mjs` | Tests du parseur (`npm test`) |
| `src/lib/talents.ts` | Hook `useTalents`, types, formatage |
| `src/pages/Talents.tsx` | Les quatre onglets |
| `src/components/TalentCard.tsx` | La carte swipe |
| `preview/talents.tsx` | Prévisualisation hors-ligne |
