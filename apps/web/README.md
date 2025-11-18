# Supplier Dashboard (Next.js)

Interface React/Next.js qui consomme l'API FastAPI (`backend/`) pour afficher les KPIs fournisseurs, les actions recommandées et les courbes de prédictions.

## Prérequis

- `pnpm install`
- Copier `env.example` vers `.env.local` puis définir l'URL du backend :

```bash
cp apps/web/env.example apps/web/.env.local
# Adapter NEXT_PUBLIC_SUPPLIER_API_URL si l'API ne tourne pas sur http://127.0.0.1:8000
```

## Démarrage local

```bash
pnpm --filter web dev
```

Assurez-vous que FastAPI (`uvicorn backend.main:app --reload --port 8000`) et Supabase local sont démarrés pour que les appels axios aboutissent.
