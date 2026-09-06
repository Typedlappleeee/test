# Worker d'ingestion Telegram

Il écoute les salons Telegram configurés depuis l'app (Talents → Salons), parse
les annonces, télécharge les photos et pousse le tout dans Supabase. L'app ne se
connecte jamais à Telegram : elle ne lit que la base.

## Pourquoi un compte utilisateur et non un bot

Un bot Telegram ne peut lire un salon que s'il en est membre, ce qui suppose
d'être admin du salon ou de pouvoir y ajouter un bot. Sur une marketplace tierce
où tu n'es qu'un membre parmi d'autres, c'est impossible. Le worker se connecte
donc via MTProto avec **ton compte** : il voit exactement ce que tu vois, rien de
plus.

Ce que ça implique, sans détour :

- `TG_SESSION` équivaut à un accès complet à ton compte Telegram. Traite ce
  fichier comme un mot de passe : jamais dans un dépôt, jamais dans l'app livrée.
- Telegram tolère mal les comptes automatisés qui *écrivent*. Ce worker ne fait
  que lire et ne répond jamais : c'est le régime le moins risqué, pas un régime
  sans risque. Utilise un compte dédié plutôt que ton compte principal.
- Les annonces contiennent des données personnelles (photos, âge, nationalité).
  Si tu es en UE, tu es responsable de traitement : conserve ce qui te sert,
  supprime le reste, et sache répondre à une demande d'effacement. La table
  `talent_listings` est faite pour ça — une suppression par `dedupe_key` efface
  l'annonce, ses décisions et son favori en cascade.

## Mise en route

```bash
cd worker-telegram
npm install
cp .env.example .env
```

1. **api_id / api_hash** — <https://my.telegram.org> → *API development tools*.
   Reporte-les dans `.env`.
2. **Session** — `npm run login`. Le script demande ton numéro, le code reçu et
   ton mot de passe 2FA, puis imprime `TG_SESSION` **et la liste des salons
   visibles depuis ce compte, avec leur identifiant**. Colle la session dans
   `.env`, garde la liste sous la main.
3. **Supabase** — joue `supabase/talents.sql` dans le SQL editor, puis récupère
   `SUPABASE_SERVICE_KEY` (Settings → API → `service_role`). Cette clé contourne
   les RLS : elle ne sort jamais du serveur.
4. **ORG_ID** — l'organisation ScaleFlow qui recevra les annonces
   (`select id, name from organizations;`).
5. Dans l'app, **Talents → Salons → Ajouter**, avec le `@username` (salon public)
   ou l'identifiant numérique donné à l'étape 2 (salon privé).

```bash
npm run backfill   # rattrape l'historique du salon, puis écoute en continu
npm start          # écoute seulement les nouveaux messages
```

Le worker relit la liste des salons et les filtres toutes les 60 secondes :
ajouter un salon depuis l'app ne demande pas de le redémarrer.

## En production

Le worker doit tourner en permanence, sinon les annonces publiées pendant son
absence ne sont jamais vues — `npm run backfill` les rattrape, mais seulement
sur les `BACKFILL_LIMIT` derniers messages. Un service systemd sur un petit VPS
suffit :

```ini
[Unit]
Description=ScaleFlow — ingestion Telegram
After=network-online.target

[Service]
WorkingDirectory=/opt/scaleflow/worker-telegram
ExecStart=/usr/bin/node src/index.mjs
Restart=always
RestartSec=10
User=scaleflow

[Install]
WantedBy=multi-user.target
```

Une seule instance par organisation. Deux workers sur les mêmes salons ne
créeront pas de doublons (la contrainte d'unicité sur `dedupe_key` l'interdit),
mais téléchargeront les photos deux fois pour rien.

## Ajouter un format de salon

Chaque marketplace écrit ses libellés à sa façon. Quand un salon remplit
l'onglet « messages mal lus » de l'app, ouvre un de ces messages, repère les
libellés et ajoute-les dans `aliases` du champ correspondant, dans
`shared/talents/fields.mjs`. Ajoute ensuite un cas à
`test/parse.test.mjs` et lance `npm test` : le format est couvert pour de bon.

Le parseur est partagé avec l'app (`shared/talents/`) — une correction ici
profite aux deux, sans risque de divergence.
