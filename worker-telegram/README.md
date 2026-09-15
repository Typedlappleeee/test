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

Puis `npm start` ouvre <http://localhost:8787>. Bouton **⚙ Salons & filtres**
en haut à droite : tes salons Telegram y sont listés, clique **Écouter** sur les
marketplaces qui t'intéressent. C'est fini — les annonces arrivent toutes seules, photos
comprises, et apparaissent dans la page sans la rafraîchir.

Tout tient sur un écran : **À trier**, **Favoris** et **Écartées** sont trois
volets du même écran, et les réglages (salons, filtres) vivent dans le tiroir
**⚙ Salons & filtres**.

**Rattraper l'historique** d'un salon que tu viens d'ajouter : bouton
**Rattraper** en face de son nom (dans le tiroir), ou `npm run backfill` au démarrage pour tous.
Un rattrapage complète aussi les photos manquantes des annonces déjà captées,
sans toucher à tes décisions — et saute celles qui ont déjà les leurs, donc un
second passage est quasi instantané.

**Trois façons de trier**, selon ce que tu fais :

- **Mode sourcing** (le bouton, ou `espace`) — plein écran, la photo en grand à
  gauche, la fiche à droite, `←` pass · `→` match · `↓` plus tard. Chaque
  décision enchaîne sur la suivante sans quitter l'écran : c'est le mode pour
  abattre un parc entier. `A` / `E` changent de photo, `Échap` sort.
- **Liste** — tout le parc sur une page, une ligne par annonce, comparable d'un
  coup d'œil. Les en-têtes de colonnes trient ; les boutons tranchent sur place.
- **Une par une** — la carte que l'on glisse, quand on prend son temps.

Le menu **Trier** ordonne par prix, niveau d'anglais, heures par jour, âge ou
date ; le menu **Salon** restreint à une marketplace.

Tant que le terminal reste ouvert, ça écoute. Tu peux fermer l'onglet du
navigateur, c'est le worker qui capte, pas la page.

---

## Transférer les matchs vers un salon

Chaque annonce retenue peut partir dans un salon Telegram à toi, photos
comprises : l'équipe la voit sans copier-coller. Réglage dans **⚙ Salons &
filtres → Transférer les matchs**, avec le salon de destination.

C'est un **transfert natif** : les photos suivent et le salon d'origine reste
mentionné. Quand la marketplace protège son contenu (certaines l'interdisent),
l'annonce est recopiée — le texte et les photos arrivent, l'attribution est
perdue.

### Le point de prudence

Jusqu'ici le worker ne faisait que **lire**, ce qui est le régime le plus sûr
pour un compte utilisateur. Transférer, c'est **écrire** — et c'est ce
comportement-là que Telegram sanctionne quand il devient massif.

Trois garde-fous en place :

- **Les envois sont sérialisés**, espacés de quelques secondes. Trier vite peut
  produire dix matchs en dix secondes ; ils partent un par un.
- **Une annonce déjà transférée ne repart jamais**, même re-matchée.
- **Rien ne part rétroactivement.** Au démarrage, les matchs antérieurs ne sont
  pas renvoyés d'office — sinon activer l'option expédierait tout l'historique
  d'un coup. Un bouton explicite rattrape ceux qui n'ont jamais été envoyés.

Vise un salon **à toi** (un canal dont tu es admin, ou « Messages enregistrés »,
la conversation avec toi-même — risque nul). Les conversations privées avec des
tiers ne sont volontairement pas proposées comme destination.

## Lire les photos

Un modèle de vision (CLIP) tourne **sur ta machine** et repère ce que la photo
montre : tatouages, silhouette, couleur de cheveux, piercings, type de prise de
vue. Aucune image n'est envoyée à un service tiers. Le modèle (~90 Mo) se
télécharge une fois au premier lancement, puis tout fonctionne hors ligne.
Compter environ 100 ms par photo.

```bash
npm install @huggingface/transformers   # une fois, ~130 Mo de dépendances
npm run vision                          # analyse les annonces déjà captées
```

Puis, dans **⚙ Salons & filtres → Lire les photos**, active *Analyser les
nouvelles annonces automatiquement* et choisis tes critères.

### Ce que ça vaut, sans enjoliver

Le modèle compare l'image à des descriptions et retient celle qui colle le
mieux. Il est fiable sur ce qui est net et binaire — des tatouages visibles, une
couleur de cheveux. Il l'est beaucoup moins sur la morphologie : « forte
poitrine » n'a pas de définition qu'un modèle sache trancher de façon stable, et
le résultat dépend du cadrage, de la pose, du vêtement.

Trois garde-fous en découlent :

- **Chaque étiquette porte sa confiance.** Contour plein = le modèle est sûr ;
  contour pointillé + pourcentage = il ne l'est pas.
- **Un attribut incertain ne filtre jamais.** Sous son seuil, il s'affiche mais
  n'écarte rien.
- **Rien ne disparaît.** Une annonce écartée par un critère visuel part dans
  **Écartées** avec sa raison, et se remet à trier d'un clic.

Le modèle vérifie d'abord qu'il y a bien une personne sur la photo. Sans ce
garde-fou il étiquetterait aussi les bannières et les captures de tarifs, qui
sont courantes dans ces canaux — avec autant d'assurance.

Enfin, ces étiquettes décrivent des personnes réelles et sont enregistrées dans
`data/db.json` : en UE, elles relèvent des mêmes obligations que le reste de
l'annonce.

## Le lancer tout seul au démarrage de Windows

Pas besoin de serveur : le worker tourne sur ton PC. Pour qu'il démarre sans y
penser, mets un raccourci vers **`demarrer.bat`** dans le dossier de démarrage
de Windows :

1. Touche **Windows + R**, tape `shell:startup`, Entrée
2. Clic droit sur `demarrer.bat` → **Créer un raccourci**
3. Glisse le raccourci dans le dossier ouvert à l'étape 1

À chaque ouverture de session, il rattrape ce qui est paru pendant que le PC
était éteint, puis reste à l'écoute. Pour l'arrêter : ferme la fenêtre.

### Combien tu rates quand le PC est éteint

Rien, tant que le rattrapage remonte plus loin que ton absence. Il parcourt
jusqu'à `BACKFILL_LIMIT` messages par salon (600 par défaut) **en partant du
plus récent**, et s'arrête dès qu'il retombe sur une série d'annonces déjà
connues. Une limite large ne coûte donc rien au quotidien : après une nuit, il
relit une trentaine de messages et s'arrête ; après une semaine, il remonte
aussi loin qu'il faut.

Monte `BACKFILL_LIMIT` dans `.env` si tes salons sont très actifs ou si tu
laisses passer plusieurs jours.

Un VPS ne devient utile que pour capter **pendant que ton PC est éteint** — ou
pour que ton équipe voie le même parc, ce qui relève plutôt du mode Supabase.

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

Chaque marketplace écrit ses libellés à sa façon. Le volet **Écartées** liste
les annonces « mal lues » : trop peu de champs reconnus pour entrer dans le
deck. Ouvre `data/db.json` sur l'une d'elles et compare son `raw` à ses
`fields` — les libellés absents des `fields` sont ceux que le lecteur ignore.

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
