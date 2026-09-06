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

- **Lecture** : `docs/TALENTS.md` — comment le système fonctionne et pourquoi.
- **Ingestion** : `worker-telegram/README.md` — brancher les salons Telegram.
- **Base** : `supabase/talents.sql` — à jouer dans le SQL editor Supabase.

Le parseur et le scoring vivent dans `shared/talents/` : une seule
implémentation, importée par le worker Node et par l'app.
