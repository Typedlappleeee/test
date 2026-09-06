# ScaleFlow — desktop

Application desktop ScaleFlow (React 18 + Vite + Electron + Supabase).

Ce dépôt contient le snapshot de l'app **plus le module Talents** : le sourcing
de modèles depuis les salons Telegram de marketplace, avec tri automatique et
système match / pass.

```bash
npm install
npm run dev                 # l'app (nécessite une session Supabase)
npm run preview:talents     # l'écran Talents seul, sans Supabase ni Telegram
```

## Talents

Le plus court chemin pour l'essayer, sans rien installer d'autre que Node :

```bash
cd worker-telegram
npm run start:demo      # http://localhost:8787, annonces d'exemple
```

Puis pour le brancher sur tes vrais salons :

```bash
npm install && npm run login && npm start
```

- **Mise en route** : `worker-telegram/README.md`
- **Comment ça marche et pourquoi** : `docs/TALENTS.md`
- **Mode équipe (Supabase)** : `supabase/talents.sql`

Le parseur et le scoring vivent dans `shared/talents/` : une seule
implémentation, importée par le worker Node et par l'app.
