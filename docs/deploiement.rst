===========
Déploiement
===========

Ce chapitre couvre le déploiement de la plateforme en production.

Prérequis Production
====================

Infrastructure
--------------

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Composant
     - Recommandation
   * - **Serveur Backend**
     - VPS avec 2+ vCPU, 4GB+ RAM
   * - **Base de données**
     - Supabase Pro ou PostgreSQL dédié
   * - **Frontend**
     - Vercel, Netlify ou serveur Node.js
   * - **Domaine**
     - Certificat SSL/TLS obligatoire
   * - **Ollama** (optionnel)
     - Serveur avec GPU recommandé

Services Recommandés
--------------------

- **Backend** : Railway, Render, DigitalOcean App Platform, AWS EC2
- **Frontend** : Vercel (recommandé), Netlify, AWS Amplify
- **Database** : Supabase Cloud, AWS RDS, DigitalOcean Managed DB


Variables d'Environnement
=========================

Backend (.env)
--------------

.. code-block:: ini

   # ============================
   # PRODUCTION ENVIRONMENT
   # ============================

   # Mode d'exécution
   ENVIRONMENT=production
   DEBUG=false

   # Base de données PostgreSQL
   DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require

   # Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key

   # Ollama (optionnel)
   OLLAMA_BASE_URL=http://ollama-server:11434
   OLLAMA_MODEL=mistral

   # CORS - Domaines autorisés
   ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com

   # Logging
   LOG_LEVEL=INFO

Frontend (.env.local)
---------------------

.. code-block:: ini

   # ============================
   # PRODUCTION ENVIRONMENT
   # ============================

   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

   # Backend API
   NEXT_PUBLIC_API_URL=https://api.votre-domaine.com

   # Site
   NEXT_PUBLIC_SITE_URL=https://votre-domaine.com

   # Analytics (optionnel)
   NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX

.. warning::
   Ne jamais exposer les clés ``SERVICE_KEY`` côté frontend !


Déploiement Backend
===================

Option 1 : Docker
-----------------

**Dockerfile** :

.. code-block:: dockerfile

   FROM python:3.11-slim

   WORKDIR /app

   # Installer les dépendances système
   RUN apt-get update && apt-get install -y \
       gcc \
       libpq-dev \
       && rm -rf /var/lib/apt/lists/*

   # Copier les requirements
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   # Copier le code
   COPY . .

   # Port d'écoute
   EXPOSE 8000

   # Commande de démarrage
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

**docker-compose.yml** :

.. code-block:: yaml

   version: '3.8'

   services:
     backend:
       build: ./backend
       ports:
         - "8000:8000"
       environment:
         - DATABASE_URL=${DATABASE_URL}
         - SUPABASE_URL=${SUPABASE_URL}
         - SUPABASE_KEY=${SUPABASE_KEY}
       restart: unless-stopped
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:8000/docs"]
         interval: 30s
         timeout: 10s
         retries: 3

     ollama:
       image: ollama/ollama:latest
       ports:
         - "11434:11434"
       volumes:
         - ollama_data:/root/.ollama
       restart: unless-stopped

   volumes:
     ollama_data:

**Déploiement** :

.. code-block:: bash

   # Build et lancement
   docker-compose up -d --build

   # Vérifier les logs
   docker-compose logs -f backend

Option 2 : Déploiement Direct
-----------------------------

.. code-block:: bash

   # Installer les dépendances
   pip install -r requirements.txt

   # Lancer avec Gunicorn (production)
   gunicorn main:app \
     --workers 4 \
     --worker-class uvicorn.workers.UvicornWorker \
     --bind 0.0.0.0:8000 \
     --access-logfile - \
     --error-logfile -

Configuration Nginx
-------------------

.. code-block:: nginx

   server {
       listen 80;
       server_name api.votre-domaine.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name api.votre-domaine.com;

       ssl_certificate /etc/ssl/certs/votre-cert.pem;
       ssl_certificate_key /etc/ssl/private/votre-key.pem;

       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           
           # WebSocket support
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }


Déploiement Frontend
====================

Option 1 : Vercel (Recommandé)
------------------------------

1. Connectez votre repository GitHub
2. Configurez le projet :

   - **Framework Preset** : Next.js
   - **Root Directory** : apps/web
   - **Build Command** : pnpm build
   - **Output Directory** : .next

3. Ajoutez les variables d'environnement
4. Déployez

.. code-block:: bash

   # Via CLI Vercel
   cd apps/web
   vercel --prod

Option 2 : Docker
-----------------

**Dockerfile.frontend** :

.. code-block:: dockerfile

   FROM node:18-alpine AS builder

   WORKDIR /app

   # Installer pnpm
   RUN npm install -g pnpm

   # Copier les fichiers de dépendances
   COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
   COPY apps/web/package.json ./apps/web/
   COPY packages/ ./packages/

   # Installer les dépendances
   RUN pnpm install --frozen-lockfile

   # Copier le code source
   COPY . .

   # Build
   RUN pnpm --filter web build

   # Image de production
   FROM node:18-alpine AS runner

   WORKDIR /app

   ENV NODE_ENV=production

   COPY --from=builder /app/apps/web/.next/standalone ./
   COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
   COPY --from=builder /app/apps/web/public ./apps/web/public

   EXPOSE 3000

   CMD ["node", "apps/web/server.js"]


Configuration Supabase Production
=================================

Sécurité RLS
------------

Assurez-vous que RLS est activé sur toutes les tables :

.. code-block:: sql

   -- Vérifier RLS
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';

   -- Activer RLS si nécessaire
   ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
   ALTER TABLE workspace_datasets ENABLE ROW LEVEL SECURITY;
   ALTER TABLE custom_kpis ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

Configuration Auth
------------------

Dans le dashboard Supabase :

1. **Site URL** : ``https://votre-domaine.com``
2. **Redirect URLs** : 
   - ``https://votre-domaine.com/auth/callback``
   - ``https://votre-domaine.com/auth/confirm``

3. **Email Templates** : Personnaliser les emails

Backup
------

Configurez les sauvegardes automatiques :

- **Daily backups** : Activé (plan Pro)
- **Point-in-time recovery** : Activé si disponible


Monitoring & Logs
=================

Logging Backend
---------------

.. code-block:: python

   # backend/logging_config.py
   import logging
   import sys

   def setup_logging():
       logging.basicConfig(
           level=logging.INFO,
           format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
           handlers=[
               logging.StreamHandler(sys.stdout),
               logging.FileHandler('app.log')
           ]
       )

   # Dans main.py
   from logging_config import setup_logging
   setup_logging()

   logger = logging.getLogger(__name__)

   @app.middleware("http")
   async def log_requests(request, call_next):
       logger.info(f"{request.method} {request.url.path}")
       response = await call_next(request)
       logger.info(f"Status: {response.status_code}")
       return response

Health Check
------------

.. code-block:: python

   @app.get("/health")
   async def health_check(db: Session = Depends(get_db)):
       """Endpoint de health check"""
       try:
           # Vérifier la connexion DB
           db.execute(text("SELECT 1"))
           return {
               "status": "healthy",
               "database": "connected",
               "timestamp": datetime.utcnow().isoformat()
           }
       except Exception as e:
           return JSONResponse(
               status_code=503,
               content={
                   "status": "unhealthy",
                   "error": str(e)
               }
           )

Métriques
---------

Intégration avec Prometheus (optionnel) :

.. code-block:: python

   from prometheus_fastapi_instrumentator import Instrumentator

   # Dans main.py
   Instrumentator().instrument(app).expose(app)


Sécurité Production
===================

Checklist
---------

.. list-table::
   :widths: 10 60 30
   :header-rows: 1

   * - 
     - Vérification
     - Status
   * - ☐
     - HTTPS activé partout
     - Obligatoire
   * - ☐
     - Variables sensibles dans secrets manager
     - Obligatoire
   * - ☐
     - RLS activé sur Supabase
     - Obligatoire
   * - ☐
     - CORS configuré strictement
     - Obligatoire
   * - ☐
     - Rate limiting activé
     - Recommandé
   * - ☐
     - Logs d'audit activés
     - Recommandé
   * - ☐
     - Backups configurés
     - Recommandé
   * - ☐
     - Monitoring en place
     - Recommandé

Rate Limiting
-------------

.. code-block:: python

   from slowapi import Limiter
   from slowapi.util import get_remote_address

   limiter = Limiter(key_func=get_remote_address)
   app.state.limiter = limiter

   @app.get("/api/workspaces")
   @limiter.limit("100/minute")
   async def list_workspaces(...):
       ...

Headers de Sécurité
-------------------

.. code-block:: python

   from fastapi.middleware.trustedhost import TrustedHostMiddleware
   from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware

   # Redirection HTTPS
   app.add_middleware(HTTPSRedirectMiddleware)

   # Hosts autorisés
   app.add_middleware(
       TrustedHostMiddleware,
       allowed_hosts=["votre-domaine.com", "*.votre-domaine.com"]
   )


Mise à l'Échelle
================

Backend
-------

.. code-block:: yaml

   # docker-compose.scale.yml
   services:
     backend:
       deploy:
         replicas: 3
         resources:
           limits:
             cpus: '1'
             memory: 1G

Avec un load balancer Nginx :

.. code-block:: nginx

   upstream backend {
       least_conn;
       server backend1:8000;
       server backend2:8000;
       server backend3:8000;
   }

   server {
       location /api {
           proxy_pass http://backend;
       }
   }

Base de Données
---------------

- **Connection pooling** : PgBouncer
- **Read replicas** : Pour les lectures intensives
- **Indexes** : Optimiser les requêtes fréquentes


Maintenance
===========

Mises à Jour
------------

.. code-block:: bash

   # Sauvegarder la base de données
   pg_dump -h host -U user -d database > backup.sql

   # Mettre à jour le code
   git pull origin main

   # Installer les nouvelles dépendances
   pip install -r requirements.txt

   # Redémarrer les services
   docker-compose down
   docker-compose up -d --build

Rollback
--------

.. code-block:: bash

   # Revenir à la version précédente
   git checkout v1.0.0

   # Restaurer la base de données si nécessaire
   psql -h host -U user -d database < backup.sql

   # Redéployer
   docker-compose up -d --build


Support & Dépannage
===================

Logs à Vérifier
---------------

1. **Logs applicatifs** : ``docker-compose logs backend``
2. **Logs Nginx** : ``/var/log/nginx/error.log``
3. **Logs Supabase** : Dashboard Supabase > Logs

Problèmes Courants
------------------

**Erreur 502 Bad Gateway**

- Vérifier que le backend est en cours d'exécution
- Vérifier la configuration Nginx proxy_pass

**Erreur de connexion DB**

- Vérifier DATABASE_URL
- Vérifier les règles firewall
- Vérifier SSL/TLS

**Performance lente**

- Activer le caching
- Optimiser les requêtes SQL
- Augmenter les ressources serveur


.. seealso::
   - :doc:`securite` pour les configurations de sécurité
   - :doc:`api` pour la documentation des endpoints
