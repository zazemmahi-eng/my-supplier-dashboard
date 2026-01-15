======================
Guide d'Installation
======================

Ce guide vous accompagne dans l'installation complète de la plateforme d'analyse des fournisseurs.

Prérequis
=========

Logiciels Requis
----------------

.. list-table::
   :widths: 30 20 50
   :header-rows: 1

   * - Logiciel
     - Version
     - Notes
   * - **Python**
     - 3.11+
     - Requis pour le backend
   * - **Node.js**
     - 18+
     - Requis pour le frontend
   * - **pnpm**
     - 8+
     - Gestionnaire de paquets (recommandé)
   * - **PostgreSQL**
     - 15+
     - Via Supabase ou local
   * - **Git**
     - 2.0+
     - Contrôle de version
   * - **Ollama** *(optionnel)*
     - Latest
     - Pour le mapping LLM intelligent

Vérification des Prérequis
--------------------------

.. code-block:: bash

   # Vérifier Python
   python --version
   # Python 3.11.x ou supérieur

   # Vérifier Node.js
   node --version
   # v18.x.x ou supérieur

   # Vérifier pnpm
   pnpm --version
   # 8.x.x ou supérieur


Installation du Backend
=======================

1. Cloner le Projet
-------------------

.. code-block:: bash

   git clone https://github.com/votre-repo/next-supabase-saas-kit-lite.git
   cd next-supabase-saas-kit-lite

2. Créer l'Environnement Python
-------------------------------

.. code-block:: bash

   # Créer un environnement virtuel
   cd backend
   python -m venv venv

   # Activer l'environnement
   # Sur Windows:
   venv\Scripts\activate
   
   # Sur Linux/macOS:
   source venv/bin/activate

3. Installer les Dépendances
----------------------------

.. code-block:: bash

   pip install -r requirements.txt

Liste des dépendances principales :

.. code-block:: text

   # Framework FastAPI
   fastapi==0.115.5
   uvicorn[standard]==0.32.0

   # Base de données
   SQLAlchemy==2.0.36
   psycopg[binary]==3.2.3

   # Configuration & Validation
   pydantic==2.9.2
   pydantic-settings==2.6.1
   python-dotenv==1.0.1

   # Analyse de données
   pandas==2.2.3
   numpy==2.1.3
   scikit-learn==1.5.2

   # Export & Reporting
   openpyxl==3.1.2
   reportlab==4.2.0

4. Configuration de l'Environnement
-----------------------------------

Copiez le fichier d'exemple et configurez vos variables :

.. code-block:: bash

   cp env.example .env

Éditez le fichier ``.env`` :

.. code-block:: ini

   # Base de données PostgreSQL
   DATABASE_URL=postgresql://user:password@localhost:5432/suppliers_db

   # Configuration Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key

   # Ollama (optionnel - pour mapping LLM)
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=mistral

5. Initialiser la Base de Données
---------------------------------

.. code-block:: bash

   # Créer les tables
   python -c "from database import init_db; init_db()"

   # Ou utiliser le script de migration
   python migrate_users_workspaces.py

6. Lancer le Backend
--------------------

.. code-block:: bash

   # Mode développement avec rechargement automatique
   uvicorn main:app --reload --host 0.0.0.0 --port 8000

   # Vérifier que l'API fonctionne
   # Ouvrir: http://localhost:8000/docs

.. tip::
   L'interface Swagger UI est disponible à ``http://localhost:8000/docs``
   et ReDoc à ``http://localhost:8000/redoc``.


Installation du Frontend
========================

1. Installer les Dépendances
----------------------------

Depuis la racine du projet :

.. code-block:: bash

   # Retourner à la racine
   cd ..

   # Installer toutes les dépendances (monorepo)
   pnpm install

2. Configuration de l'Environnement
-----------------------------------

.. code-block:: bash

   cd apps/web
   cp env.example .env.local

Éditez le fichier ``.env.local`` :

.. code-block:: ini

   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

   # Backend API
   NEXT_PUBLIC_API_URL=http://localhost:8000

   # Site
   NEXT_PUBLIC_SITE_URL=http://localhost:3000

3. Lancer le Frontend
---------------------

.. code-block:: bash

   # Mode développement
   pnpm dev

   # Ou depuis la racine
   cd ../..
   pnpm dev --filter web

.. note::
   Le frontend sera accessible à ``http://localhost:3000``


Configuration Supabase
======================

1. Créer un Projet Supabase
---------------------------

1. Rendez-vous sur `supabase.com <https://supabase.com>`_
2. Créez un nouveau projet
3. Notez les informations de connexion

2. Configuration de l'Authentification
--------------------------------------

Dans le dashboard Supabase :

1. Allez dans **Authentication > Providers**
2. Activez **Email** (Email/Password)
3. Configurez les URLs de redirection :

   .. code-block:: text

      Site URL: http://localhost:3000
      Redirect URLs: http://localhost:3000/auth/callback

3. Création des Tables
----------------------

Exécutez les migrations SQL :

.. code-block:: sql

   -- Table des workspaces
   CREATE TABLE workspaces (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       name VARCHAR(200) NOT NULL,
       description TEXT,
       data_type VARCHAR(50) DEFAULT 'delays',
       status VARCHAR(50) DEFAULT 'active',
       owner_id UUID REFERENCES auth.users(id),
       user_id UUID REFERENCES auth.users(id),
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Table des datasets
   CREATE TABLE workspace_datasets (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
       filename VARCHAR(255) NOT NULL,
       row_count INTEGER DEFAULT 0,
       column_count INTEGER DEFAULT 0,
       suppliers JSONB DEFAULT '[]',
       data JSONB,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   -- Table des rôles utilisateurs
   CREATE TABLE user_roles (
       user_id UUID PRIMARY KEY REFERENCES auth.users(id),
       role VARCHAR(50) DEFAULT 'user',
       email VARCHAR(200),
       display_name VARCHAR(200),
       is_active BOOLEAN DEFAULT true,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

4. Politiques de Sécurité (RLS)
-------------------------------

.. code-block:: sql

   -- Activer RLS
   ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
   ALTER TABLE workspace_datasets ENABLE ROW LEVEL SECURITY;

   -- Politique: les utilisateurs ne voient que leurs workspaces
   CREATE POLICY "Users can view own workspaces" ON workspaces
       FOR SELECT USING (auth.uid() = user_id OR auth.uid() = owner_id);

   CREATE POLICY "Users can insert own workspaces" ON workspaces
       FOR INSERT WITH CHECK (auth.uid() = user_id);


Installation d'Ollama (Optionnel)
=================================

Ollama permet le mapping intelligent des colonnes CSV via un LLM local.

1. Installer Ollama
-------------------

.. code-block:: bash

   # Sur Windows (PowerShell - en tant qu'admin)
   winget install ollama

   # Sur macOS
   brew install ollama

   # Sur Linux
   curl https://ollama.ai/install.sh | sh

2. Télécharger un Modèle
------------------------

.. code-block:: bash

   # Télécharger Mistral (recommandé)
   ollama pull mistral

   # Ou Llama 3
   ollama pull llama3

3. Vérifier l'Installation
--------------------------

.. code-block:: bash

   # Lancer Ollama
   ollama serve

   # Tester le modèle
   ollama run mistral "Hello, how are you?"

.. important::
   Si Ollama n'est pas disponible, le système utilisera le fallback
   par pattern matching (expressions régulières).


Développement Local
===================

Lancer l'Ensemble de l'Application
----------------------------------

1. **Terminal 1** - Backend :

   .. code-block:: bash

      cd backend
      source venv/bin/activate  # ou venv\Scripts\activate sur Windows
      uvicorn main:app --reload --port 8000

2. **Terminal 2** - Frontend :

   .. code-block:: bash

      cd apps/web
      pnpm dev

3. **Terminal 3** - Ollama (optionnel) :

   .. code-block:: bash

      ollama serve

Vérification de l'Installation
------------------------------

.. list-table::
   :widths: 30 40 30
   :header-rows: 1

   * - Service
     - URL
     - Status attendu
   * - Backend API
     - http://localhost:8000/docs
     - Swagger UI visible
   * - Frontend
     - http://localhost:3000
     - Page d'accueil
   * - Ollama
     - http://localhost:11434
     - "Ollama is running"


Résolution des Problèmes
========================

Erreur : Module not found
-------------------------

.. code-block:: bash

   # Assurez-vous d'être dans le bon environnement virtuel
   which python  # Doit pointer vers venv/bin/python

   # Réinstallez les dépendances
   pip install -r requirements.txt

Erreur : Database connection failed
-----------------------------------

1. Vérifiez que PostgreSQL est en cours d'exécution
2. Vérifiez les informations de connexion dans ``.env``
3. Testez la connexion :

   .. code-block:: bash

      python test_connection.py

Erreur : CORS policy
--------------------

Vérifiez que les origines sont bien configurées dans ``main.py`` :

.. code-block:: python

   origins = [
       "http://localhost:3000",
       "http://127.0.0.1:3000",
   ]

Erreur : Ollama not available
-----------------------------

Ce n'est pas bloquant ! Le système utilisera le fallback pattern matching.
Pour résoudre :

1. Vérifiez qu'Ollama est lancé : ``ollama serve``
2. Testez : ``curl http://localhost:11434``


Prochaines Étapes
=================

Une fois l'installation terminée :

1. Consultez le :doc:`guide-utilisateur` pour créer votre premier workspace
2. Explorez les fonctionnalités d':doc:`ingestion-donnees`
3. Consultez la :doc:`api` pour l'intégration
