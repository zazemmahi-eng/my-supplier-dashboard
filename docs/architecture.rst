============
Architecture
============

Cette section décrit l'architecture technique de la plateforme d'analyse des fournisseurs.

Vue d'Ensemble
==============

.. code-block:: text

   ┌─────────────────────────────────────────────────────────────────┐
   │                        FRONTEND                                 │
   │                   Next.js 15 + React                            │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
   │  │Dashboard │  │Workspaces│  │  Admin   │  │ Reports  │        │
   │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
   └───────┼─────────────┼─────────────┼─────────────┼───────────────┘
           │             │             │             │
           └─────────────┴──────┬──────┴─────────────┘
                                │ API REST (HTTP/JSON)
   ┌────────────────────────────┼────────────────────────────────────┐
   │                        BACKEND                                  │
   │                       FastAPI 3.0                               │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
   │  │  Routes  │  │ Analyse  │  │   LLM    │  │ Reports  │        │
   │  │   API    │  │   ML     │  │ Ingestion│  │  Export  │        │
   │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
   └───────┼─────────────┼─────────────┼─────────────┼───────────────┘
           │             │             │             │
           └─────────────┴──────┬──────┴─────────────┘
                                │
   ┌────────────────────────────┼────────────────────────────────────┐
   │                     BASE DE DONNÉES                             │
   │                  PostgreSQL (Supabase)                          │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
   │  │  Users   │  │Workspaces│  │ Datasets │  │  KPIs    │        │
   │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
   └─────────────────────────────────────────────────────────────────┘


Backend (FastAPI)
=================

Le backend est construit avec **FastAPI**, un framework Python moderne et performant.

Structure des Modules
---------------------

.. code-block:: text

   backend/
   ├── main.py                 # Point d'entrée FastAPI
   ├── database.py             # Configuration SQLAlchemy
   ├── models.py               # Modèles de base (Supplier, Order)
   ├── workspace_models.py     # Modèles workspace
   ├── workspace_routes.py     # Routes API workspaces
   ├── admin_routes.py         # Routes API admin
   ├── admin_models.py         # Modèles admin & rôles
   ├── upload_routes.py        # Routes upload CSV
   ├── reporting_routes.py     # Routes export PDF/Excel
   ├── mon_analyse.py          # Module d'analyse ML
   ├── llm_ingestion.py        # Module mapping LLM
   └── kpi_expression_parser.py# Parser KPIs personnalisés

Configuration FastAPI
---------------------

.. code-block:: python

   from fastapi import FastAPI
   from fastapi.middleware.cors import CORSMiddleware

   app = FastAPI(
       title="API Fournisseurs - Analyse Prédictive Avancée",
       version="3.0.0",
       description="Backend avec prédictions avancées"
   )

   # Configuration CORS
   origins = [
       "http://localhost:3000",
       "http://127.0.0.1:3000",
   ]

   app.add_middleware(
       CORSMiddleware,
       allow_origins=origins,
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )

Routers Inclus
--------------

.. list-table::
   :widths: 30 20 50
   :header-rows: 1

   * - Router
     - Préfixe
     - Description
   * - ``workspace_router``
     - ``/api/workspaces``
     - Gestion des espaces de travail
   * - ``upload_router``
     - ``/api``
     - Upload de fichiers CSV
   * - ``reporting_router``
     - ``/api/reports``
     - Export PDF/Excel
   * - ``admin_router``
     - ``/api/admin``
     - Administration


Frontend (Next.js)
==================

Le frontend utilise **Next.js 15** avec l'architecture App Router.

Structure du Projet
-------------------

.. code-block:: text

   apps/web/
   ├── app/                    # App Router (pages)
   │   ├── (auth)/            # Routes authentification
   │   ├── (dashboard)/       # Routes dashboard
   │   └── api/               # API routes Next.js
   ├── components/             # Composants React
   ├── lib/                    # Utilitaires & hooks
   ├── config/                 # Configuration
   └── styles/                 # Styles CSS

Technologies Frontend
---------------------

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Technologie
     - Utilisation
   * - **Next.js 15**
     - Framework React avec SSR/SSG
   * - **React 18**
     - Bibliothèque UI
   * - **TailwindCSS v4**
     - Styles utilitaires
   * - **Shadcn UI**
     - Composants UI
   * - **React Query**
     - Gestion du cache & requêtes
   * - **Zod**
     - Validation des formulaires


Base de Données (Supabase)
==========================

La base de données utilise **PostgreSQL** via **Supabase**.

Modèles de Données
------------------

Workspace
^^^^^^^^^

.. code-block:: python

   class Workspace(Base):
       __tablename__ = "workspaces"
       
       id = Column(UUID, primary_key=True, default=uuid.uuid4)
       name = Column(String(200), nullable=False)
       description = Column(Text, nullable=True)
       data_type = Column(Enum(DataTypeCase), default=DataTypeCase.CASE_A)
       status = Column(Enum(WorkspaceStatus), default=WorkspaceStatus.ACTIVE)
       owner_id = Column(UUID, nullable=True)
       user_id = Column(UUID, nullable=True)
       created_at = Column(DateTime, default=datetime.utcnow)
       updated_at = Column(DateTime, onupdate=datetime.utcnow)

WorkspaceDataset
^^^^^^^^^^^^^^^^

.. code-block:: python

   class WorkspaceDataset(Base):
       __tablename__ = "workspace_datasets"
       
       id = Column(UUID, primary_key=True)
       workspace_id = Column(UUID, ForeignKey("workspaces.id"))
       filename = Column(String(255))
       row_count = Column(Integer, default=0)
       column_count = Column(Integer, default=0)
       suppliers = Column(JSON, default=list)
       data = Column(JSON)  # Données CSV stockées en JSON

CustomKPI
^^^^^^^^^

.. code-block:: python

   class CustomKPI(Base):
       __tablename__ = "custom_kpis"
       
       id = Column(UUID, primary_key=True)
       workspace_id = Column(UUID, ForeignKey("workspaces.id"))
       name = Column(String(100))
       formula_type = Column(String(50))  # average, sum, percentage, expression
       formula = Column(Text)  # Expression personnalisée
       threshold_warning = Column(Float)
       threshold_critical = Column(Float)

Relations
---------

.. code-block:: text

   ┌─────────────┐       ┌──────────────────┐
   │   Users     │───────│   Workspaces     │
   └─────────────┘  1:N  └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
               ┌────▼────┐  ┌─────▼─────┐  ┌────▼────┐
               │Datasets │  │Custom KPIs│  │ Models  │
               └─────────┘  └───────────┘  └─────────┘


Couche ML / Analytics
=====================

Le module ``mon_analyse.py`` fournit les analyses prédictives.

Algorithmes Disponibles
-----------------------

1. **Moyenne Glissante**

   .. code-block:: python

      def moyenne_glissante(serie: pd.Series, fenetre: int = 3) -> float:
          """Calcule la moyenne sur les N dernières valeurs"""
          return serie.tail(fenetre).mean()

2. **Régression Linéaire**

   .. code-block:: python

      from sklearn.linear_model import LinearRegression

      def prediction_regression(serie: pd.Series) -> float:
          """Prédit la prochaine valeur par régression linéaire"""
          X = np.arange(len(serie)).reshape(-1, 1)
          y = serie.values
          model = LinearRegression().fit(X, y)
          return model.predict([[len(serie)]])[0]

3. **Lissage Exponentiel**

   .. code-block:: python

      def lissage_exponentiel(serie: pd.Series, alpha: float = 0.3) -> float:
          """Applique un lissage exponentiel simple"""
          result = serie.iloc[0]
          for val in serie.iloc[1:]:
              result = alpha * val + (1 - alpha) * result
          return result

KPIs Calculés
-------------

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - KPI
     - Description
   * - ``taux_retard``
     - Pourcentage de commandes livrées en retard
   * - ``taux_defaut``
     - Taux moyen de défauts (0-100%)
   * - ``retard_moyen``
     - Retard moyen en jours (si retard)
   * - ``score_risque``
     - Score composite de risque fournisseur (0-100)
   * - ``taux_conformite``
     - Pourcentage de commandes parfaites


Intégration LLM (Ollama)
========================

Le module ``llm_ingestion.py`` gère le mapping intelligent des colonnes CSV.

Architecture LLM
----------------

.. code-block:: text

   ┌─────────────────────────────────────────────────────────────┐
   │                    CSV Upload                               │
   └────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │              LLMColumnAnalyzer                              │
   │  ┌─────────────────────────────────────────────────────┐   │
   │  │ 1. Analyse des colonnes (noms, types, échantillons) │   │
   │  └─────────────────────────────────────────────────────┘   │
   │                         │                                   │
   │                         ▼                                   │
   │  ┌─────────────────────────────────────────────────────┐   │
   │  │ 2. Appel Ollama (si disponible)                     │   │
   │  │    - Modèle: mistral / llama3                       │   │
   │  │    - Prompt: analyse des colonnes                   │   │
   │  └─────────────────────────────────────────────────────┘   │
   │                         │                                   │
   │                         ▼                                   │
   │  ┌─────────────────────────────────────────────────────┐   │
   │  │ 3. Fallback: Pattern matching (regex)               │   │
   │  └─────────────────────────────────────────────────────┘   │
   └─────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │              DataNormalizer                                 │
   │  - Conversion des dates                                     │
   │  - Normalisation des défauts (0-1)                          │
   │  - Calcul du délai                                          │
   │  - Validation des contraintes                               │
   └─────────────────────────────────────────────────────────────┘

Configuration Ollama
--------------------

.. code-block:: python

   # Variables d'environnement
   OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
   OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")

.. important::
   Ollama s'exécute **localement** - aucune donnée n'est envoyée à des API externes.


Flux de Données
===============

Processus d'Import
------------------

.. code-block:: text

   1. Upload CSV
        │
        ▼
   2. Analyse LLM (mapping colonnes)
        │
        ▼
   3. Validation du schéma (Case A/B/C)
        │
        ▼
   4. Normalisation des données
        │
        ▼
   5. Stockage dans WorkspaceDataset
        │
        ▼
   6. Calcul des KPIs
        │
        ▼
   7. Génération des prédictions

Processus d'Analyse
-------------------

.. code-block:: text

   1. Chargement DataFrame
        │
        ▼
   2. calculer_kpis_globaux()
        │
        ▼
   3. calculer_risques_fournisseurs()
        │
        ▼
   4. calculer_predictions_avancees()
        │
        ▼
   5. obtenir_actions_recommandees()


Sécurité
========

L'architecture intègre plusieurs niveaux de sécurité :

* **Authentification** : Supabase Auth (JWT)
* **Autorisation** : Système de rôles (user/admin)
* **Isolation des données** : Par user_id/workspace_id
* **CORS** : Configuration stricte des origines autorisées

Pour plus de détails, consultez la section :doc:`securite`.
