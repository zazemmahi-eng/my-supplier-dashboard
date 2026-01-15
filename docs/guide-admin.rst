======================
Guide Administrateur
======================

Ce guide présente les fonctionnalités d'administration de la plateforme.

.. important::
   Les fonctionnalités décrites dans ce guide sont **réservées aux administrateurs**.

Rôle Administrateur
===================

Définition
----------

L'administrateur est un utilisateur disposant de privilèges étendus pour :

- Superviser l'ensemble des utilisateurs
- Consulter (lecture seule) les workspaces de tous les utilisateurs
- Gérer les comptes utilisateurs
- Accéder aux statistiques globales
- Consulter les logs d'audit

Restrictions
------------

.. warning::
   L'administrateur **NE PEUT PAS** modifier les données des utilisateurs :
   
   - ❌ Modifier les workspaces
   - ❌ Modifier les KPIs personnalisés
   - ❌ Modifier les données importées
   - ❌ Modifier les prédictions

Cette restriction garantit l'intégrité des données et la traçabilité des actions.


Accès Administrateur
====================

Connexion Admin
---------------

1. Connectez-vous avec vos identifiants habituels
2. Si votre compte a le rôle ``admin``, vous serez redirigé vers le dashboard admin
3. Le menu affichera les options d'administration

Vérification du Rôle
--------------------

L'API vérifie automatiquement votre rôle via le header ``X-Admin-User-ID`` :

.. code-block:: http

   GET /api/admin/check-role HTTP/1.1
   X-Admin-User-ID: your-uuid
   X-Admin-Email: admin@example.com

Réponse :

.. code-block:: json

   {
     "is_admin": true,
     "user_id": "uuid",
     "email": "admin@example.com",
     "role": "admin"
   }


Dashboard Administrateur
========================

Vue d'Ensemble
--------------

Le dashboard admin présente les statistiques globales :

.. code-block:: text

   ┌─────────────────────────────────────────────────────────────┐
   │                 DASHBOARD ADMINISTRATEUR                    │
   ├─────────────────────────────────────────────────────────────┤
   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
   │  │ Total   │  │ Total   │  │ WS par  │  │ Total   │        │
   │  │ Users   │  │ WS      │  │ User    │  │ Fourn.  │        │
   │  │   45    │  │  128    │  │  2.8    │  │  520    │        │
   │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
   │                                                             │
   │  ┌───────────────────────────────────────────────────────┐ │
   │  │              RÉPARTITION DES WORKSPACES               │ │
   │  │  Case A: 45%  │  Case B: 35%  │  Case C: 20%          │ │
   │  └───────────────────────────────────────────────────────┘ │
   │                                                             │
   │  ┌──────────────────────┐  ┌──────────────────────┐        │
   │  │ UTILISATEURS ACTIFS  │  │ ACTIVITÉ RÉCENTE     │        │
   │  └──────────────────────┘  └──────────────────────┘        │
   └─────────────────────────────────────────────────────────────┘

Statistiques Affichées
----------------------

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Métrique
     - Description
   * - **Total Users**
     - Nombre total d'utilisateurs enregistrés
   * - **Total Workspaces**
     - Nombre total de workspaces créés
   * - **WS par User**
     - Moyenne de workspaces par utilisateur
   * - **Total Fournisseurs**
     - Nombre total de fournisseurs distincts
   * - **Users Actifs**
     - Utilisateurs avec activité récente


Gestion des Utilisateurs
========================

Liste des Utilisateurs
----------------------

Accès : **Admin** → **Utilisateurs**

La liste affiche pour chaque utilisateur :

- Email
- Nom d'affichage
- Rôle (user/admin)
- Nombre de workspaces
- Nombre de fournisseurs
- Date de création
- Statut (actif/inactif)

Actions Disponibles
-------------------

.. list-table::
   :widths: 20 30 50
   :header-rows: 1

   * - Action
     - Icône
     - Description
   * - **Voir**
     - 👁️
     - Consulter les détails de l'utilisateur
   * - **Créer**
     - ➕
     - Ajouter un nouvel utilisateur
   * - **Supprimer**
     - 🗑️
     - Supprimer l'utilisateur et ses données
   * - **Promouvoir**
     - ⬆️
     - Promouvoir au rôle admin

Créer un Utilisateur
--------------------

1. Cliquez sur **"Nouvel Utilisateur"**
2. Renseignez :

   - **Email** (obligatoire)
   - **Nom d'affichage** (optionnel)
   - **Mot de passe** (min. 8 caractères)
   - **Rôle** (user par défaut)

3. Cliquez sur **"Créer"**

.. code-block:: http

   POST /api/admin/users HTTP/1.1
   Content-Type: application/json
   X-Admin-User-ID: admin-uuid

   {
     "email": "nouveau@example.com",
     "display_name": "Nouveau Utilisateur",
     "password": "MotDePasse123!",
     "role": "user"
   }

Supprimer un Utilisateur
------------------------

.. danger::
   La suppression est **irréversible** et entraîne la suppression en cascade :
   
   - Tous les workspaces de l'utilisateur
   - Tous les datasets associés
   - Tous les KPIs personnalisés
   - Tous les logs d'activité

1. Cliquez sur l'icône 🗑️
2. Confirmez la suppression dans le modal

Promouvoir un Utilisateur Admin
-------------------------------

1. Cliquez sur **"Promouvoir Admin"**
2. Sélectionnez l'utilisateur
3. Confirmez l'action

.. code-block:: http

   POST /api/admin/promote-to-admin HTTP/1.1
   Content-Type: application/json
   X-Admin-User-ID: admin-uuid

   {
     "user_id": "target-user-uuid"
   }


Consultation des Workspaces
===========================

Accès en Lecture Seule
----------------------

L'administrateur peut consulter tous les workspaces de tous les utilisateurs,
mais **uniquement en lecture**.

Vue des Workspaces d'un Utilisateur
-----------------------------------

1. Cliquez sur un utilisateur dans la liste
2. L'onglet **"Workspaces"** affiche ses espaces de travail
3. Cliquez sur un workspace pour voir son dashboard

.. code-block:: http

   GET /api/admin/users/{user_id}/workspaces HTTP/1.1
   X-Admin-User-ID: admin-uuid

Réponse :

.. code-block:: json

   {
     "workspaces": [
       {
         "id": "uuid",
         "name": "Analyse Q1 2026",
         "data_type": "delays",
         "status": "active",
         "supplier_count": 15,
         "row_count": 450
       }
     ]
   }

Dashboard Utilisateur (Lecture Seule)
-------------------------------------

L'admin peut visualiser le dashboard complet d'un workspace :

.. code-block:: http

   GET /api/admin/users/{user_id}/workspaces/{workspace_id}/dashboard HTTP/1.1
   X-Admin-User-ID: admin-uuid

Le dashboard affiche :

- KPIs globaux
- Liste des fournisseurs
- Prédictions
- KPIs personnalisés

.. note::
   Toutes les actions de modification sont **désactivées** en mode admin.


Logs d'Audit
============

Concept
-------

Toutes les actions administratives sont enregistrées dans un journal d'audit
pour garantir la traçabilité.

Actions Enregistrées
--------------------

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

Consulter les Logs
------------------

Accès : **Admin** → **Audit Log**

.. code-block:: http

   GET /api/admin/audit-log?limit=100 HTTP/1.1
   X-Admin-User-ID: admin-uuid

Réponse :

.. code-block:: json

   {
     "logs": [
       {
         "id": "uuid",
         "admin_user_id": "admin-uuid",
         "action": "user_delete",
         "target_type": "user",
         "target_id": "deleted-user-uuid",
         "details": {
           "email": "deleted@example.com",
           "workspace_count": 3
         },
         "created_at": "2026-01-15T10:30:00Z"
       }
     ],
     "total": 1250
   }

Filtrage des Logs
-----------------

Paramètres de requête disponibles :

- ``action`` : Filtrer par type d'action
- ``admin_user_id`` : Filtrer par admin
- ``target_type`` : Filtrer par type de cible (user, workspace)
- ``start_date`` / ``end_date`` : Période
- ``limit`` / ``offset`` : Pagination


Permissions Détaillées
======================

Matrice des Permissions
-----------------------

.. list-table::
   :widths: 40 30 30
   :header-rows: 1

   * - Action
     - Utilisateur
     - Admin
   * - Voir ses propres workspaces
     - ✅
     - ✅
   * - Modifier ses propres workspaces
     - ✅
     - ✅ (pour lui-même)
   * - Voir les workspaces des autres
     - ❌
     - ✅ (lecture seule)
   * - Modifier les workspaces des autres
     - ❌
     - ❌
   * - Créer des utilisateurs
     - ❌
     - ✅
   * - Supprimer des utilisateurs
     - ❌
     - ✅
   * - Voir les stats globales
     - ❌
     - ✅
   * - Voir les logs d'audit
     - ❌
     - ✅

Implémentation Technique
------------------------

La vérification des droits admin se fait via une dépendance FastAPI :

.. code-block:: python

   async def get_current_admin(
       x_admin_user_id: Optional[str] = Header(None),
       db: Session = Depends(get_db)
   ) -> AdminUserInfo:
       """Vérifie que l'utilisateur est admin"""
       
       # Vérification du header
       if not x_admin_user_id:
           raise HTTPException(status_code=401)
       
       # Vérification en base
       result = db.execute(
           text("SELECT role FROM user_roles WHERE user_id = :uid"),
           {"uid": x_admin_user_id}
       )
       
       if result.fetchone()[0] != 'admin':
           raise HTTPException(status_code=403)
       
       return AdminUserInfo(...)


Bonnes Pratiques Admin
======================

Sécurité
--------

1. **Ne partagez jamais** vos identifiants admin
2. **Utilisez un mot de passe fort** (min. 12 caractères)
3. **Déconnectez-vous** après chaque session admin
4. **Consultez régulièrement** les logs d'audit

Gestion des Utilisateurs
------------------------

1. **Vérifiez l'identité** avant de créer un compte
2. **Documentez les suppressions** (raison, date)
3. **Limitez le nombre d'admins** au strict nécessaire
4. **Faites des revues périodiques** des accès

Supervision
-----------

1. **Surveillez les statistiques** pour détecter les anomalies
2. **Analysez les logs d'audit** hebdomadairement
3. **Alertez sur les comportements suspects**


API Admin - Référence Rapide
============================

.. list-table::
   :widths: 40 60
   :header-rows: 1

   * - Endpoint
     - Description
   * - ``GET /api/admin/stats``
     - Statistiques globales
   * - ``GET /api/admin/users``
     - Liste des utilisateurs
   * - ``GET /api/admin/users/{id}``
     - Détails utilisateur
   * - ``POST /api/admin/users``
     - Créer utilisateur
   * - ``DELETE /api/admin/users/{id}``
     - Supprimer utilisateur
   * - ``POST /api/admin/promote-to-admin``
     - Promouvoir admin
   * - ``GET /api/admin/users/{id}/workspaces``
     - Workspaces d'un utilisateur
   * - ``GET /api/admin/.../dashboard``
     - Dashboard (lecture seule)
   * - ``GET /api/admin/audit-log``
     - Logs d'audit
   * - ``GET /api/admin/check-role``
     - Vérifier rôle admin


.. seealso::
   - :doc:`securite` pour les détails sur le contrôle d'accès
   - :doc:`api` pour la documentation API complète
