===================
Documentation API
===================

Cette section documente les endpoints de l'API REST FastAPI.

.. tip::
   L'interface Swagger UI est disponible à ``http://localhost:8000/docs``
   et ReDoc à ``http://localhost:8000/redoc``.

Vue d'Ensemble
==============

L'API est organisée en plusieurs groupes de routes :

.. list-table::
   :widths: 25 25 50
   :header-rows: 1

   * - Préfixe
     - Tag
     - Description
   * - ``/api/workspaces``
     - workspaces
     - Gestion des espaces de travail
   * - ``/api``
     - upload
     - Upload de fichiers CSV
   * - ``/api/reports``
     - reports
     - Export PDF/Excel
   * - ``/api/admin``
     - admin
     - Administration


Authentification
================

Toutes les routes nécessitent une authentification via headers :

.. code-block:: http

   X-User-ID: <uuid>           # ID utilisateur Supabase
   X-Admin-User-ID: <uuid>     # ID admin (routes admin)
   X-Admin-Email: <email>      # Email admin (routes admin)


API Workspaces
==============

Lister les Workspaces
---------------------

.. code-block:: http

   GET /api/workspaces HTTP/1.1
   X-User-ID: user-uuid

**Paramètres de requête** :

- ``status`` (optionnel) : ``active``, ``archived``, ``pending``

**Réponse 200** :

.. code-block:: json

   {
     "workspaces": [
       {
         "id": "550e8400-e29b-41d4-a716-446655440000",
         "name": "Analyse Q1 2026",
         "description": "Analyse trimestrielle",
         "data_type": "delays",
         "status": "active",
         "created_at": "2026-01-01T10:00:00Z",
         "updated_at": "2026-01-15T14:30:00Z",
         "has_data": true,
         "supplier_count": 15,
         "row_count": 450
       }
     ]
   }

Créer un Workspace
------------------

.. code-block:: http

   POST /api/workspaces HTTP/1.1
   Content-Type: application/json
   X-User-ID: user-uuid

   {
     "name": "Nouveau Workspace",
     "description": "Description optionnelle",
     "data_type": "delays"
   }

**Corps de la requête** :

.. list-table::
   :widths: 20 15 15 50
   :header-rows: 1

   * - Champ
     - Type
     - Requis
     - Description
   * - ``name``
     - string
     - ✅
     - Nom (1-200 caractères)
   * - ``description``
     - string
     - ❌
     - Description
   * - ``data_type``
     - string
     - ❌
     - ``delays``, ``late_days``, ``mixed``

**Réponse 201** :

.. code-block:: json

   {
     "id": "550e8400-e29b-41d4-a716-446655440001",
     "name": "Nouveau Workspace",
     "description": "Description optionnelle",
     "data_type": "delays",
     "status": "active",
     "created_at": "2026-01-15T15:00:00Z"
   }

Obtenir un Workspace
--------------------

.. code-block:: http

   GET /api/workspaces/{workspace_id} HTTP/1.1
   X-User-ID: user-uuid

**Réponse 200** :

.. code-block:: json

   {
     "id": "550e8400-e29b-41d4-a716-446655440000",
     "name": "Analyse Q1 2026",
     "description": "Analyse trimestrielle",
     "data_type": "delays",
     "status": "active",
     "has_data": true,
     "supplier_count": 15,
     "row_count": 450,
     "custom_kpis": [
       {
         "id": "kpi-uuid",
         "name": "Score Composite",
         "formula_type": "expression"
       }
     ]
   }

Modifier un Workspace
---------------------

.. code-block:: http

   PUT /api/workspaces/{workspace_id} HTTP/1.1
   Content-Type: application/json
   X-User-ID: user-uuid

   {
     "name": "Nom modifié",
     "description": "Nouvelle description",
     "status": "archived"
   }

**Réponse 200** :

.. code-block:: json

   {
     "id": "workspace-uuid",
     "name": "Nom modifié",
     "updated_at": "2026-01-15T16:00:00Z"
   }

Supprimer un Workspace
----------------------

.. code-block:: http

   DELETE /api/workspaces/{workspace_id} HTTP/1.1
   X-User-ID: user-uuid

**Réponse 204** : No Content

.. warning::
   La suppression est irréversible et supprime toutes les données associées.


API Upload
==========

Upload Standard
---------------

.. code-block:: http

   POST /api/workspaces/{workspace_id}/upload HTTP/1.1
   Content-Type: multipart/form-data
   X-User-ID: user-uuid

   file: <fichier.csv>

**Réponse 200** :

.. code-block:: json

   {
     "success": true,
     "message": "Fichier importé avec succès",
     "result": {
       "filename": "data.csv",
       "row_count": 450,
       "supplier_count": 15,
       "columns": ["supplier", "date_promised", "date_delivered", "defects"]
     }
   }

**Erreur 400** :

.. code-block:: json

   {
     "detail": "Colonnes manquantes: date_delivered"
   }

Upload Intelligent (LLM)
------------------------

.. code-block:: http

   POST /api/workspaces/{workspace_id}/upload-intelligent HTTP/1.1
   Content-Type: multipart/form-data
   X-User-ID: user-uuid

   file: <fichier.csv>

**Réponse 200** :

.. code-block:: json

   {
     "success": true,
     "message": "Import intelligent réussi",
     "result": {
       "detected_case": "mixed",
       "row_count": 450,
       "supplier_count": 15,
       "column_mappings": [
         {
           "source_column": "Nom_Fournisseur",
           "target_role": "supplier",
           "confidence": 0.95
         }
       ],
       "warnings": [],
       "transformations": []
     }
   }

Télécharger un Exemple
----------------------

.. code-block:: http

   GET /api/workspaces/{workspace_id}/sample-csv HTTP/1.1
   X-User-ID: user-uuid

**Réponse** : Fichier CSV


API Dashboard
=============

Obtenir les KPIs Globaux
------------------------

.. code-block:: http

   GET /api/workspaces/{workspace_id}/kpis HTTP/1.1
   X-User-ID: user-uuid

**Réponse 200** :

.. code-block:: json

   {
     "taux_retard": 15.5,
     "taux_defaut": 3.2,
     "retard_moyen": 2.5,
     "nb_fournisseurs": 15,
     "nb_commandes": 450,
     "defaut_max": 8.5,
     "retard_max": 12,
     "commandes_parfaites": 380,
     "taux_conformite": 84.4
   }

Obtenir les Risques Fournisseurs
--------------------------------

.. code-block:: http

   GET /api/workspaces/{workspace_id}/risks HTTP/1.1
   X-User-ID: user-uuid

**Paramètres de requête** :

- ``sort_by`` : ``score_risque``, ``taux_retard``, ``taux_defaut``
- ``order`` : ``asc``, ``desc``

**Réponse 200** :

.. code-block:: json

   {
     "suppliers": [
       {
         "supplier": "Fournisseur B",
         "score_risque": 72.5,
         "niveau_risque": "Élevé",
         "status": "alert",
         "retard_moyen": 5.2,
         "taux_defaut": 4.8,
         "taux_retard": 35.0,
         "nb_commandes": 45,
         "volatilite_defauts": 2.1,
         "volatilite_retards": 3.5,
         "tendance_defauts": "hausse",
         "tendance_retards": "stable",
         "derniere_commande": "2026-01-10",
         "jours_depuis_derniere": 5
       }
     ]
   }

Obtenir les Prédictions
-----------------------

.. code-block:: http

   GET /api/workspaces/{workspace_id}/predictions HTTP/1.1
   X-User-ID: user-uuid

**Paramètres de requête** :

- ``method`` : ``moving_average``, ``linear_regression``, ``exponential``, ``combined``
- ``window`` : Taille de la fenêtre (défaut: 3)

**Réponse 200** :

.. code-block:: json

   {
     "predictions": {
       "Fournisseur A": {
         "prediction_retard": 1.8,
         "prediction_defaut": 0.015,
         "confidence": 0.82,
         "trend": "stable"
       },
       "Fournisseur B": {
         "prediction_retard": 5.5,
         "prediction_defaut": 0.052,
         "confidence": 0.75,
         "trend": "hausse"
       }
     },
     "method_used": "combined",
     "comparison": {
       "moving_average": {...},
       "linear_regression": {...},
       "exponential": {...}
     }
   }

Obtenir les Actions Recommandées
--------------------------------

.. code-block:: http

   GET /api/workspaces/{workspace_id}/actions HTTP/1.1
   X-User-ID: user-uuid

**Réponse 200** :

.. code-block:: json

   {
     "actions": [
       {
         "supplier": "Fournisseur B",
         "priority": "high",
         "action_type": "review",
         "message": "Réunion urgente recommandée",
         "details": "Score de risque élevé (72.5) avec tendance à la hausse"
       },
       {
         "supplier": "Fournisseur C",
         "priority": "medium",
         "action_type": "monitor",
         "message": "Surveillance accrue nécessaire",
         "details": "Volatilité des défauts en augmentation"
       }
     ]
   }


API KPIs Personnalisés
======================

Créer un KPI
------------

.. code-block:: http

   POST /api/workspaces/{workspace_id}/kpis/custom HTTP/1.1
   Content-Type: application/json
   X-User-ID: user-uuid

   {
     "name": "Score Composite",
     "description": "Score combinant retard et défauts",
     "formula_type": "expression",
     "formula": "(taux_retard * 0.6) + (taux_defaut * 0.4)",
     "threshold_warning": 30,
     "threshold_critical": 60,
     "unit": "points",
     "decimal_places": 1
   }

**Corps de la requête** :

.. list-table::
   :widths: 25 15 15 45
   :header-rows: 1

   * - Champ
     - Type
     - Requis
     - Description
   * - ``name``
     - string
     - ✅
     - Nom du KPI
   * - ``formula_type``
     - string
     - ✅
     - ``average``, ``sum``, ``percentage``, ``expression``
   * - ``target_field``
     - string
     - ❌
     - Champ cible (types simples)
   * - ``formula``
     - string
     - ❌
     - Expression (type expression)
   * - ``threshold_warning``
     - float
     - ❌
     - Seuil d'avertissement
   * - ``threshold_critical``
     - float
     - ❌
     - Seuil critique

**Réponse 201** :

.. code-block:: json

   {
     "id": "kpi-uuid",
     "name": "Score Composite",
     "created_at": "2026-01-15T10:00:00Z"
   }

Valider une Formule
-------------------

.. code-block:: http

   POST /api/workspaces/{workspace_id}/kpis/validate HTTP/1.1
   Content-Type: application/json
   X-User-ID: user-uuid

   {
     "formula": "(taux_retard * 0.6) + (taux_defaut * 0.4)"
   }

**Réponse 200** :

.. code-block:: json

   {
     "valid": true,
     "variables_used": ["taux_retard", "taux_defaut"],
     "sample_result": 12.5
   }

**Réponse 400** (formule invalide) :

.. code-block:: json

   {
     "valid": false,
     "error": "Variable inconnue: taux_inconnu",
     "available_variables": ["taux_retard", "taux_defaut", "retard_moyen", ...]
   }


API Export
==========

Export PDF
----------

.. code-block:: http

   GET /api/reports/{workspace_id}/pdf HTTP/1.1
   X-User-ID: user-uuid

**Paramètres de requête** :

- ``supplier`` : Filtrer par fournisseur (optionnel)

**Réponse** : Fichier PDF (application/pdf)

Export Excel
------------

.. code-block:: http

   GET /api/reports/{workspace_id}/excel HTTP/1.1
   X-User-ID: user-uuid

**Paramètres de requête** :

- ``supplier`` : Filtrer par fournisseur (optionnel)

**Réponse** : Fichier Excel (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)


API Admin
=========

.. note::
   Toutes les routes admin nécessitent le header ``X-Admin-User-ID``.

Statistiques Globales
---------------------

.. code-block:: http

   GET /api/admin/stats HTTP/1.1
   X-Admin-User-ID: admin-uuid

**Réponse 200** :

.. code-block:: json

   {
     "total_users": 45,
     "total_workspaces": 128,
     "workspaces_per_user": 2.8,
     "total_suppliers": 520,
     "workspace_types": {
       "delays": 58,
       "late_days": 45,
       "mixed": 25
     },
     "active_users": 38
   }

Liste des Utilisateurs
----------------------

.. code-block:: http

   GET /api/admin/users HTTP/1.1
   X-Admin-User-ID: admin-uuid

**Réponse 200** :

.. code-block:: json

   {
     "users": [
       {
         "id": "user-uuid",
         "email": "user@example.com",
         "display_name": "Jean Dupont",
         "role": "user",
         "workspace_count": 3,
         "supplier_count": 45,
         "created_at": "2026-01-01T10:00:00Z",
         "is_active": true
       }
     ]
   }

Créer un Utilisateur
--------------------

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

.. code-block:: http

   DELETE /api/admin/users/{user_id} HTTP/1.1
   X-Admin-User-ID: admin-uuid

**Réponse 204** : No Content

.. danger::
   Suppression en cascade de toutes les données de l'utilisateur.

Workspaces d'un Utilisateur
---------------------------

.. code-block:: http

   GET /api/admin/users/{user_id}/workspaces HTTP/1.1
   X-Admin-User-ID: admin-uuid

Dashboard Utilisateur (Lecture Seule)
-------------------------------------

.. code-block:: http

   GET /api/admin/users/{user_id}/workspaces/{workspace_id}/dashboard HTTP/1.1
   X-Admin-User-ID: admin-uuid

**Réponse 200** :

.. code-block:: json

   {
     "workspace": {...},
     "kpis": {...},
     "suppliers": [...],
     "predictions": {...},
     "read_only": true
   }

Logs d'Audit
------------

.. code-block:: http

   GET /api/admin/audit-log HTTP/1.1
   X-Admin-User-ID: admin-uuid

**Paramètres de requête** :

- ``limit`` : Nombre de résultats (défaut: 100)
- ``offset`` : Pagination
- ``action`` : Filtrer par type d'action

**Réponse 200** :

.. code-block:: json

   {
     "logs": [
       {
         "id": "log-uuid",
         "admin_user_id": "admin-uuid",
         "action": "user_delete",
         "target_type": "user",
         "target_id": "deleted-user-uuid",
         "details": {...},
         "created_at": "2026-01-15T10:30:00Z"
       }
     ],
     "total": 1250
   }


Codes d'Erreur
==============

.. list-table::
   :widths: 15 25 60
   :header-rows: 1

   * - Code
     - Nom
     - Description
   * - 400
     - Bad Request
     - Requête invalide (données manquantes ou incorrectes)
   * - 401
     - Unauthorized
     - Authentification requise
   * - 403
     - Forbidden
     - Accès refusé (permissions insuffisantes)
   * - 404
     - Not Found
     - Ressource non trouvée
   * - 409
     - Conflict
     - Conflit (ex: nom de workspace déjà utilisé)
   * - 422
     - Unprocessable Entity
     - Données non traitables
   * - 500
     - Internal Server Error
     - Erreur serveur

Format des Erreurs
------------------

.. code-block:: json

   {
     "detail": "Message d'erreur descriptif"
   }

Ou avec validation Pydantic :

.. code-block:: json

   {
     "detail": [
       {
         "loc": ["body", "name"],
         "msg": "field required",
         "type": "value_error.missing"
       }
     ]
   }


Pagination
==========

Les endpoints retournant des listes supportent la pagination :

.. code-block:: http

   GET /api/workspaces?limit=10&offset=20 HTTP/1.1

**Paramètres** :

- ``limit`` : Nombre d'éléments par page (défaut: 50, max: 100)
- ``offset`` : Position de départ

**Réponse** :

.. code-block:: json

   {
     "items": [...],
     "total": 128,
     "limit": 10,
     "offset": 20
   }


.. seealso::
   - :doc:`securite` pour les détails sur l'authentification
   - :doc:`ingestion-donnees` pour l'API d'ingestion
