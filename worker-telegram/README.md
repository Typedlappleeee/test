# Talent Deck — worker Telegram

Écoute tes salons Telegram de marketplace, télécharge les photos, lit chaque
annonce champ par champ, écarte les doublons — et te sert une interface pour
trancher en match ou pass.

**Deux modes, même code :**

| Mode | Pour qui | Ce qu'il faut |
|---|---|---|
| **local** (`npm start`) | toi seul, sur ton PC | Node 20+. Rien d'autre. |
| **Supabase** (`npm run start:supabase`) | une équipe qui partage le même parc | un projet Supabase |

Commence par le mode local. Tu passeras à Supabase le jour où quelqu'un d'autre
doit voir les mêmes annonces que toi.

---

## Voir à quoi ça ressemble, tout de suite

```bash
npm run start:demo
```

Ouvre <http://localhost:8787>. 40 annonces d'exemple, aucune installation,
aucune connexion. Ferme avec Ctrl+C.

---

## Le brancher pour de vrai

Il te faut **Node 20 ou plus** — <https://nodejs.org>, l'installeur par défaut
fait l'affaire. Vérifie avec `node -v`.

```bash
cd worker-telegram
npm install          # une fois
npm run login        # une fois
npm start
```

`npm run login` te demande, dans l'ordre :

1. **api_id / api_hash** — <https://my.telegram.org> → *API development tools* →
   crée une application (n'importe quel nom). Gratuit, immédiat. Ce sont *tes*
   identifiants d'application, pas ceux d'un bot.
2. **Ton numéro**, le **code** reçu sur Telegram, ton **mot de passe 2FA** si tu
   en as un.

Tout est écrit dans `.env` automatiquement. Rien à copier-coller.

Puis `npm start` ouvre <http://localhost:8787>. Va dans l'onglet **Salons** :
tes salons Telegram sont listés, clique **Écouter** sur les marketplaces qui
t'intéressent. C'est fini — les annonces arrivent toutes seules, photos
comprises, et apparaissent dans la page sans la rafraîchir.

**Rattraper l'historique** d'un salon que tu viens d'ajouter : bouton
**Rattraper** en face de son nom, ou `npm run backfill` au démarrage pour tous.
Un rattrapage complète aussi les photos manquantes des annonces déjà captées,
sans toucher à tes décisions — et saute celles qui ont déjà les leurs, donc un
second passage est quasi instantané.

**Trier vite.** Au clavier : `←` pass · `→` match · `↓` plus tard (l'annonce
repasse en fin de pile) · `espace` agrandit les photos en plein écran, où les
flèches font défiler et où tu peux trancher sans revenir en arrière. Le menu
**Trier** ordonne le deck par prix, niveau d'anglais, heures par jour, âge ou
date, et le menu **Salon** le restreint à une marketplace.

Tant que le terminal reste ouvert, ça écoute. Tu peux fermer l'onglet du
navigateur, c'est le worker qui capte, pas la page.

---

## Où sont tes données

Tout dans `worker-telegram/data/` :

```
data/db.json     annonces, décisions, favoris, filtres
data/photos/     photos téléchargées depuis Telegram
```

Sauvegarder ton travail = copier ce dossier. Repartir de zéro = le supprimer.
Rien ne sort de ta machine.

`.env` contient ta session Telegram : **elle vaut ton mot de passe**. Ne la
partage pas, ne la commite pas (`.gitignore` s'en charge déjà).

---

## Ce qu'il faut savoir avant de compter dessus

**Pourquoi un compte utilisateur et non un bot.** Un bot Telegram ne peut lire
un salon que s'il en est membre, donc si tu peux l'y ajouter. Sur une
marketplace tierce où tu n'es qu'un membre parmi d'autres, c'est impossible. Le
worker se connecte donc via MTProto avec **ton compte** : il voit exactement ce
que tu vois, rien de plus, et n'écrit jamais.

**Le risque, sans détour.** Telegram tolère mal les comptes automatisés qui
*postent*. Celui-ci ne fait que lire, ce qui est le régime le moins risqué — pas
un régime sans risque. Utilise un compte dédié plutôt que ton compte principal.

**Si le worker ne tourne pas, rien n'arrive.** C'est un service, pas une
fonctionnalité de l'app. Les annonces publiées pendant qu'il est éteint se
rattrapent avec **Rattraper**, mais seulement sur les `BACKFILL_LIMIT` derniers
messages (200 par défaut). Pour capter 24/7 sans laisser ton PC allumé, il faut
un petit VPS — voir plus bas.

**Données personnelles.** Les annonces contiennent des photos, un âge, une
nationalité de personnes réelles. En UE, tu es responsable de traitement :
conserve ce qui te sert, supprime le reste. Effacer une annonce et tout ce qui
s'y rattache = retirer sa ligne de `data/db.json` et son dossier de photos.

**Ce que le système ne fait pas.** Pas de contact automatique — l'intermédiaire
est affiché, tu écris à la main (automatiser les messages est le meilleur moyen
de faire bannir le compte). Pas de vérification d'identité ni d'âge : les champs
sont ceux du vendeur, le filtre `min_age` porte sur du déclaratif.

---

## Quand ça coince

**« Salon introuvable » au démarrage.** Le worker lit la liste de tes
conversations pour retrouver le salon ; s'il n'y est pas, c'est que le compte
Telegram connecté n'en est plus membre, ou que le salon a été supprimé. Retire-le
et rajoute-le depuis l'onglet Salons.

**« Le port 8787 est déjà pris ».** Talent Deck tourne déjà dans une autre
fenêtre — ouvre <http://localhost:8787>, ou ferme cette fenêtre-là avec Ctrl+C.
Pour deux instances en parallèle : `set PORT=8788 && npm start`.

**`0 photo(s)` sur toutes les annonces.** Le terminal dit maintenant pourquoi
(image repérée mais non téléchargée, ou l'erreur exacte). Un `npm run backfill`
complète les photos manquantes des annonces déjà captées.

## Quand un salon n'est pas lu correctement

Chaque marketplace écrit ses libellés à sa façon. Si un salon remplit peu de
champs, ouvre l'onglet **Coller une annonce**, colle un de ses messages, et
regarde ce que le lecteur a compris : ce qui apparaît **en jaune** est un
libellé qu'il ne connaît pas.

Ajoute-le dans `aliases` du champ correspondant, dans
`shared/talents/fields.mjs` :

```js
{ key: 'origin', type: 'country', label: 'Origine',
  aliases: ['origin', 'country', 'pais', /* ← ajoute le tien ici */] },
```

Puis un cas dans `test/parse.test.mjs`, et `npm test` : le format est couvert
pour de bon. Le lecteur est partagé avec l'app ScaleFlow — une correction ici
profite aux deux.

---

## Le laisser tourner en continu (VPS)

Le mode local suffit tant que tu tries à des heures de bureau. Pour ne rien
manquer, un petit VPS et un service systemd :

```ini
[Unit]
Description=Talent Deck — ingestion Telegram
After=network-online.target

[Service]
WorkingDirectory=/opt/scaleflow/worker-telegram
ExecStart=/usr/bin/node src/standalone.mjs
Restart=always
RestartSec=10
User=scaleflow

[Install]
WantedBy=multi-user.target
```

L'interface n'a **aucune authentification** : ne l'expose pas sur l'internet
public. Passe par un tunnel SSH (`ssh -L 8787:localhost:8787 ton-vps`), ou mets
un reverse proxy avec mot de passe devant.

Une seule instance par jeu de salons. Deux workers ne créeront pas de doublons
(la clé de dédoublonnage l'interdit) mais téléchargeront les photos deux fois.

---

## Mode Supabase

Quand plusieurs personnes doivent voir le même parc :

1. Joue `supabase/talents.sql` dans le SQL editor Supabase.
2. Renseigne `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (Settings → API →
   `service_role`) et `ORG_ID` dans `.env`.
3. `npm run start:supabase`

L'interface est alors la page **Talents** de l'app ScaleFlow, pas celle-ci. La
clé service_role contourne les RLS : elle ne sort jamais du serveur.

---

## Les commandes

| Commande | Ce qu'elle fait |
|---|---|
| `npm run start:demo` | interface seule, annonces d'exemple, zéro installation |
| `npm run login` | connecte ton compte Telegram, écrit `.env` |
| `npm start` | écoute les salons + sert <http://localhost:8787> |
| `npm run backfill` | rattrape l'historique de tous les salons, puis écoute |
| `npm run start:supabase` | variante multi-postes |
| `npm test` | tests du lecteur d'annonces |

Port différent : `PORT=9000 npm start`.
