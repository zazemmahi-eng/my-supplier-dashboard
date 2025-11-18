# Backend FastAPI + Supabase local

Ce répertoire contient l'API FastAPI utilisée par le dashboard Next.js. Elle exploite une base PostgreSQL locale exposée par Supabase CLI.

## 1. Prérequis

- Python 3.11+ (idéalement via `pyenv`)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- `pnpm` (déjà requis par le monorepo)

## 2. Préparer l'environnement

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Copiez ensuite `env.example` vers `.env` et adaptez si besoin :

```powershell
Copy-Item env.example .env
```

La valeur par défaut pointe vers une instance Supabase locale (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

## 3. Démarrer Supabase local

Depuis la racine du monorepo :

```powershell
pnpm --filter web supabase:start
```

Le service expose PostgreSQL sur `localhost:54322`, l'API REST et les services Supabase classiques. Utilisez `pnpm --filter web supabase:status` ou `supabase stop` pour gérer le cycle de vie.

## 4. Initialiser les tables + données de démo

1. Vérifier la connexion :

```powershell
python -m backend.test_connection
```

2. Créer les tables et migrer le CSV de démonstration :

```powershell
python -m backend.migrate_csv
```

Le script crée les fournisseurs A→F et insère toutes les commandes présentes dans `donnees.csv`.

## 5. Lancer l'API FastAPI

```powershell
uvicorn backend.main:app --reload --port 8000
```

> ⚠️ Gardez Supabase démarré avant d'exécuter FastAPI afin d'éviter les erreurs de connexion.

## 6. Endpoints principaux

- `GET /api/dashboard/data` : KPIs, risques et actions
- `GET /api/predictions` : prédictions moyenne glissante
- `POST /api/supplier/create` : création persistante dans Supabase
- `POST /api/demo/populate` : jeu de données de test

## 7. Dépannage rapide

- **Connexion refusée** : Supabase local n'est pas démarré → `pnpm --filter web supabase:start`
- **Module manquant** : relancer `pip install -r requirements.txt`
- **Pas de données** : exécuter `python -m backend.migrate_csv`

Ces étapes garantissent l'intégration complète entre FastAPI et la base Supabase locale utilisée par le frontend Next.js.

