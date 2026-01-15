=========================
Sécurité & Contrôle d'Accès
=========================

Ce chapitre détaille les mécanismes de sécurité implémentés dans la plateforme.

Vue d'Ensemble
==============

La sécurité repose sur plusieurs couches :

.. code-block:: text

   ┌─────────────────────────────────────────────────────────────┐
   │                    AUTHENTIFICATION                         │
   │                   Supabase Auth (JWT)                       │
   └────────────────────────┬────────────────────────────────────┘
                            │
   ┌────────────────────────┼────────────────────────────────────┐
   │                    AUTORISATION                             │
   │              Système de Rôles (RBAC)                        │
   │         ┌──────────────┼──────────────┐                     │
   │         │              │              │                     │
   │         ▼              ▼              ▼                     │
   │    ┌─────────┐   ┌─────────┐   ┌─────────┐                 │
   │    │  user   │   │  admin  │   │ (future)│                 │
   │    └─────────┘   └─────────┘   └─────────┘                 │
   └─────────────────────────────────────────────────────────────┘
                            │
   ┌────────────────────────┼────────────────────────────────────┐
   │                 ISOLATION DES DONNÉES                       │
   │              Par user_id / workspace_id                     │
   └─────────────────────────────────────────────────────────────┘


Authentification
================

Supabase Auth
-------------

L'authentification est gérée par **Supabase Auth** qui fournit :

- Authentification email/mot de passe
- Tokens JWT sécurisés
- Gestion des sessions
- Récupération de mot de passe

Flux d'Authentification
-----------------------

.. code-block:: text

   1. Utilisateur → Frontend (login)
        │
        ▼
   2. Frontend → Supabase Auth
        │
        ▼
   3. Supabase Auth → Validation
        │
        ▼
   4. Supabase Auth → JWT Token
        │
        ▼
   5. Frontend → Stockage token (cookie HttpOnly)
        │
        ▼
   6. Frontend → Backend (avec token)
        │
        ▼
   7. Backend → Validation JWT

Configuration Supabase Auth
---------------------------

.. code-block:: typescript

   // apps/web/lib/supabase.ts
   import { createClient } from '@supabase/supabase-js'

   export const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
   )

Headers d'Authentification
--------------------------

Les requêtes vers le backend utilisent les headers suivants :

.. code-block:: http

   # Utilisateur standard
   X-User-ID: <uuid>

   # Administrateur
   X-Admin-User-ID: <uuid>
   X-Admin-Email: <email>


Contrôle d'Accès Basé sur les Rôles (RBAC)
==========================================

Rôles Disponibles
-----------------

.. list-table::
   :widths: 20 30 50
   :header-rows: 1

   * - Rôle
     - Code
     - Description
   * - **Utilisateur**
     - ``user``
     - Accès à ses propres données
   * - **Administrateur**
     - ``admin``
     - Accès en lecture à toutes les données

Modèle de Données des Rôles
---------------------------

.. code-block:: python

   # backend/admin_models.py
   class AdminLevel(str, Enum):
       USER = "user"
       ADMIN = "admin"

   class UserRole(Base):
       __tablename__ = "user_roles"
       
       user_id = Column(UUID, primary_key=True)
       role = Column(Enum(AdminLevel), default=AdminLevel.USER)
       email = Column(String(200))
       display_name = Column(String(200))
       is_active = Column(Boolean, default=True)
       created_at = Column(DateTime, default=datetime.utcnow)

Vérification des Permissions
----------------------------

**Utilisateur Standard** :

.. code-block:: python

   async def verify_user_access(
       workspace_id: uuid.UUID,
       user_id: uuid.UUID,
       db: Session
   ) -> bool:
       """Vérifie que l'utilisateur a accès au workspace"""
       workspace = db.query(Workspace).filter(
           Workspace.id == workspace_id,
           (Workspace.user_id == user_id) | (Workspace.owner_id == user_id)
       ).first()
       return workspace is not None

**Administrateur** :

.. code-block:: python

   async def get_current_admin(
       x_admin_user_id: Optional[str] = Header(None),
       db: Session = Depends(get_db)
   ) -> AdminUserInfo:
       """Vérifie que l'utilisateur est administrateur"""
       
       if not x_admin_user_id:
           raise HTTPException(status_code=401)
       
       result = db.execute(
           text("SELECT role::text FROM user_roles WHERE user_id = :uid"),
           {"uid": x_admin_user_id}
       )
       row = result.fetchone()
       
       if not row or row[0] != 'admin':
           raise HTTPException(status_code=403)
       
       return AdminUserInfo(...)


Matrice des Permissions
=======================

Permissions Utilisateur
-----------------------

.. list-table::
   :widths: 50 25 25
   :header-rows: 1

   * - Action
     - Utilisateur
     - Admin
   * - Créer un workspace
     - ✅
     - ✅
   * - Voir ses workspaces
     - ✅
     - ✅
   * - Modifier ses workspaces
     - ✅
     - ✅
   * - Supprimer ses workspaces
     - ✅
     - ✅
   * - Voir workspaces des autres
     - ❌
     - ✅ (lecture)
   * - Modifier workspaces des autres
     - ❌
     - ❌

Permissions Admin
-----------------

.. list-table::
   :widths: 50 25 25
   :header-rows: 1

   * - Action
     - Utilisateur
     - Admin
   * - Voir statistiques globales
     - ❌
     - ✅
   * - Lister tous les utilisateurs
     - ❌
     - ✅
   * - Créer des utilisateurs
     - ❌
     - ✅
   * - Supprimer des utilisateurs
     - ❌
     - ✅
   * - Promouvoir en admin
     - ❌
     - ✅
   * - Consulter les logs d'audit
     - ❌
     - ✅

.. important::
   Les administrateurs ont un accès **lecture seule** aux données des autres utilisateurs.
   Ils ne peuvent **pas modifier** les workspaces, KPIs ou données des utilisateurs.


Isolation des Données
=====================

Principe
--------

Chaque utilisateur ne peut accéder qu'à ses propres données.
L'isolation est assurée à plusieurs niveaux :

1. **Niveau Application** : Filtrage par user_id dans les requêtes
2. **Niveau Base de Données** : Row Level Security (RLS) Supabase

Filtrage Applicatif
-------------------

.. code-block:: python

   # Exemple de filtrage dans les routes
   @router.get("/workspaces")
   async def list_workspaces(
       user_id: str = Header(alias="X-User-ID"),
       db: Session = Depends(get_db)
   ):
       workspaces = db.query(Workspace).filter(
           Workspace.user_id == uuid.UUID(user_id)
       ).all()
       return {"workspaces": workspaces}

Row Level Security (RLS)
------------------------

Configuration Supabase pour la sécurité au niveau des lignes :

.. code-block:: sql

   -- Activer RLS sur les tables
   ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
   ALTER TABLE workspace_datasets ENABLE ROW LEVEL SECURITY;
   ALTER TABLE custom_kpis ENABLE ROW LEVEL SECURITY;

   -- Politique: voir ses propres workspaces
   CREATE POLICY "Users see own workspaces" ON workspaces
       FOR SELECT
       USING (auth.uid() = user_id OR auth.uid() = owner_id);

   -- Politique: insérer dans ses workspaces
   CREATE POLICY "Users insert own workspaces" ON workspaces
       FOR INSERT
       WITH CHECK (auth.uid() = user_id);

   -- Politique: modifier ses workspaces
   CREATE POLICY "Users update own workspaces" ON workspaces
       FOR UPDATE
       USING (auth.uid() = user_id OR auth.uid() = owner_id);

   -- Politique: supprimer ses workspaces
   CREATE POLICY "Users delete own workspaces" ON workspaces
       FOR DELETE
       USING (auth.uid() = user_id OR auth.uid() = owner_id);


Accès Admin en Lecture Seule
============================

Implémentation
--------------

L'accès admin est strictement limité à la lecture :

.. code-block:: python

   @router.get("/admin/users/{user_id}/workspaces/{workspace_id}/dashboard")
   async def admin_view_dashboard(
       user_id: uuid.UUID,
       workspace_id: uuid.UUID,
       admin: AdminUserInfo = Depends(get_current_admin),
       db: Session = Depends(get_db)
   ):
       """Vue lecture seule du dashboard pour admin"""
       
       # Log de l'action
       log_admin_action(
           db=db,
           admin_id=admin.user_id,
           action="dashboard_view",
           target_type="workspace",
           target_id=str(workspace_id)
       )
       
       # Récupération des données (lecture seule)
       workspace = db.query(Workspace).filter(
           Workspace.id == workspace_id,
           Workspace.user_id == user_id
       ).first()
       
       if not workspace:
           raise HTTPException(status_code=404)
       
       # Retour avec flag read_only
       return {
           "workspace": workspace,
           "kpis": calculate_kpis(workspace),
           "read_only": True  # Indicateur pour le frontend
       }

Routes Admin Disponibles
------------------------

Les admins n'ont accès qu'aux opérations GET (lecture) sur les données utilisateurs :

.. code-block:: python

   # ✅ Autorisé - Lecture
   GET /api/admin/users/{user_id}/workspaces
   GET /api/admin/users/{user_id}/workspaces/{workspace_id}/dashboard

   # ❌ Interdit - Modification
   POST /api/admin/users/{user_id}/workspaces  # N'existe pas
   PUT /api/admin/users/{user_id}/workspaces/{id}  # N'existe pas
   DELETE /api/admin/users/{user_id}/workspaces/{id}  # N'existe pas


Audit & Traçabilité
===================

Journalisation des Actions Admin
--------------------------------

Toutes les actions administratives sont enregistrées :

.. code-block:: python

   class AdminAuditLog(Base):
       __tablename__ = "admin_audit_logs"
       
       id = Column(UUID, primary_key=True, default=uuid.uuid4)
       admin_user_id = Column(UUID, nullable=False)
       action = Column(String(100), nullable=False)
       target_type = Column(String(50))  # user, workspace
       target_id = Column(String(100))
       details = Column(JSON)
       ip_address = Column(String(50))
       created_at = Column(DateTime, default=datetime.utcnow)

   def log_admin_action(
       db: Session,
       admin_id: str,
       action: str,
       target_type: str = None,
       target_id: str = None,
       details: Dict = None
   ):
       """Enregistre une action admin dans les logs"""
       log = AdminAuditLog(
           admin_user_id=uuid.UUID(admin_id),
           action=action,
           target_type=target_type,
           target_id=target_id,
           details=details or {}
       )
       db.add(log)
       db.commit()

Actions Loguées
---------------

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Action
     - Description
   * - ``user_create``
     - Création d'un utilisateur
   * - ``user_delete``
     - Suppression d'un utilisateur
   * - ``user_promote``
     - Promotion au rôle admin
   * - ``workspace_view``
     - Consultation d'un workspace
   * - ``dashboard_view``
     - Consultation d'un dashboard
   * - ``stats_view``
     - Consultation des statistiques
   * - ``audit_view``
     - Consultation des logs d'audit


Protection CORS
===============

Configuration
-------------

La politique CORS limite les origines autorisées :

.. code-block:: python

   # backend/main.py
   from fastapi.middleware.cors import CORSMiddleware

   origins = [
       "http://localhost:3000",
       "http://127.0.0.1:3000",
       # Ajouter les domaines de production
   ]

   app.add_middleware(
       CORSMiddleware,
       allow_origins=origins,
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )

Recommandations Production
--------------------------

.. code-block:: python

   # Configuration production
   origins = [
       "https://votre-domaine.com",
       "https://www.votre-domaine.com",
   ]

   app.add_middleware(
       CORSMiddleware,
       allow_origins=origins,
       allow_credentials=True,
       allow_methods=["GET", "POST", "PUT", "DELETE"],
       allow_headers=["X-User-ID", "X-Admin-User-ID", "X-Admin-Email", "Content-Type"],
   )


Validation des Entrées
======================

Pydantic
--------

Toutes les entrées sont validées via Pydantic :

.. code-block:: python

   from pydantic import BaseModel, Field, validator

   class WorkspaceCreate(BaseModel):
       name: str = Field(..., min_length=1, max_length=200)
       description: Optional[str] = None
       data_type: DataTypeCase = DataTypeCase.CASE_A
       
       @validator('name')
       def name_must_not_be_empty(cls, v):
           if not v.strip():
               raise ValueError('Le nom ne peut pas être vide')
           return v.strip()

Sanitisation
------------

Les données textuelles sont nettoyées :

.. code-block:: python

   import html

   def sanitize_input(text: str) -> str:
       """Nettoie les entrées utilisateur"""
       if text:
           return html.escape(text.strip())
       return text


Bonnes Pratiques
================

Pour les Développeurs
---------------------

1. **Toujours vérifier l'authentification** avant d'accéder aux données
2. **Toujours filtrer par user_id** dans les requêtes
3. **Ne jamais exposer** les IDs internes dans les URLs si non nécessaire
4. **Valider toutes les entrées** avec Pydantic
5. **Logger les actions sensibles**

Pour les Administrateurs
------------------------

1. **Auditer régulièrement** les logs d'accès
2. **Limiter le nombre d'admins** au strict minimum
3. **Utiliser des mots de passe forts**
4. **Déconnecter les sessions** après utilisation

Pour la Production
------------------

1. **Configurer CORS strictement**
2. **Activer HTTPS** obligatoirement
3. **Configurer RLS** sur toutes les tables sensibles
4. **Monitorer les accès** suspects
5. **Effectuer des audits de sécurité** réguliers


Variables d'Environnement Sensibles
===================================

.. warning::
   Ne jamais commiter les variables sensibles dans le code source !

.. code-block:: ini

   # .env (jamais commité)
   
   # Supabase
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   
   # Database
   DATABASE_URL=postgresql://user:password@host:5432/db
   
   # Secrets
   JWT_SECRET=your-secret-key

Recommandations :

- Utiliser des gestionnaires de secrets (Vault, AWS Secrets Manager)
- Rotation régulière des clés
- Permissions minimales sur les fichiers .env


.. seealso::
   - :doc:`guide-admin` pour les permissions admin détaillées
   - :doc:`deploiement` pour la sécurité en production
