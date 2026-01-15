=========================
Ingestion de Données & LLM
=========================

Ce chapitre détaille le processus d'ingestion des données CSV et le mapping
intelligent par LLM (Large Language Model).

Vue d'Ensemble
==============

Le système d'ingestion permet d'importer des fichiers CSV avec :

1. **Import Standard** : Validation stricte du schéma prédéfini
2. **Import Intelligent** : Mapping automatique des colonnes via LLM

.. code-block:: text

   ┌─────────────────────────────────────────────────────────────┐
   │                    FICHIER CSV                              │
   └────────────────────────┬────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
            ▼                               ▼
   ┌─────────────────┐             ┌─────────────────┐
   │ Import Standard │             │ Import LLM      │
   │ (schéma fixe)   │             │ (mapping auto)  │
   └────────┬────────┘             └────────┬────────┘
            │                               │
            └───────────────┬───────────────┘
                            │
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                  NORMALISATION                              │
   │  - Conversion des dates                                     │
   │  - Normalisation des défauts (0-1)                          │
   │  - Calcul du délai                                          │
   └────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                  VALIDATION                                 │
   │  - Contraintes de type                                      │
   │  - Valeurs obligatoires                                     │
   │  - Plages de valeurs                                        │
   └────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                  STOCKAGE                                   │
   │              (WorkspaceDataset)                             │
   └─────────────────────────────────────────────────────────────┘


Schémas de Données
==================

Trois types de données (cases) sont supportés, chacun avec son schéma spécifique.

Case A : Retards Uniquement
---------------------------

Analyse basée sur les dates de livraison.

**Colonnes requises** :

.. list-table::
   :widths: 25 20 55
   :header-rows: 1

   * - Colonne
     - Type
     - Description
   * - ``supplier``
     - string
     - Nom du fournisseur
   * - ``date_promised``
     - date
     - Date de livraison promise
   * - ``date_delivered``
     - date
     - Date de livraison effective

**Exemple CSV** :

.. code-block:: text

   supplier,date_promised,date_delivered
   Fournisseur A,2026-01-01,2026-01-03
   Fournisseur A,2026-01-05,2026-01-05
   Fournisseur B,2026-01-02,2026-01-10

**Métriques calculées** :

- Délai (delay) = date_delivered - date_promised
- Taux de retard
- Retard moyen

Case B : Défauts Uniquement
---------------------------

Analyse basée sur les taux de défauts.

**Colonnes requises** :

.. list-table::
   :widths: 25 20 55
   :header-rows: 1

   * - Colonne
     - Type
     - Description
   * - ``supplier``
     - string
     - Nom du fournisseur
   * - ``order_date``
     - date
     - Date de la commande
   * - ``defects``
     - float
     - Taux de défauts (0.0 - 1.0)

**Exemple CSV** :

.. code-block:: text

   supplier,order_date,defects
   Fournisseur A,2026-01-01,0.02
   Fournisseur A,2026-01-05,0.01
   Fournisseur B,2026-01-02,0.05

**Métriques calculées** :

- Taux de défauts moyen
- Tendance des défauts
- Volatilité

Case C : Mixte
--------------

Combine retards et défauts pour une analyse complète.

**Colonnes requises** :

.. list-table::
   :widths: 25 20 55
   :header-rows: 1

   * - Colonne
     - Type
     - Description
   * - ``supplier``
     - string
     - Nom du fournisseur
   * - ``date_promised``
     - date
     - Date de livraison promise
   * - ``date_delivered``
     - date
     - Date de livraison effective
   * - ``defects``
     - float
     - Taux de défauts (0.0 - 1.0)

**Exemple CSV** :

.. code-block:: text

   supplier,date_promised,date_delivered,defects
   Fournisseur A,2026-01-01,2026-01-03,0.02
   Fournisseur A,2026-01-05,2026-01-05,0.01
   Fournisseur B,2026-01-02,2026-01-10,0.05


Mapping LLM Intelligent
=======================

Architecture
------------

Le module ``llm_ingestion.py`` utilise **Ollama** (LLM local) pour analyser
et suggérer des mappings de colonnes.

.. important::
   **Aucune donnée n'est envoyée à des API externes.**
   Ollama s'exécute entièrement en local.

Rôles de Colonnes
-----------------

Le système reconnaît les rôles suivants :

.. code-block:: python

   class ColumnRole(str, Enum):
       SUPPLIER = "supplier"              # Nom fournisseur
       DATE_PROMISED = "date_promised"    # Date promise
       DATE_DELIVERED = "date_delivered"  # Date livrée
       ORDER_DATE = "order_date"          # Date commande
       DELAY = "delay"                    # Retard calculé
       DELAY_DIRECT = "delay_direct"      # Retard direct
       DEFECTS = "defects"                # Taux défauts
       QUALITY_SCORE = "quality_score"    # Score qualité
       DEFECTIVE_COUNT = "defective_count"  # Nb défectueux
       TOTAL_COUNT = "total_count"        # Nb total
       NON_DEFECTIVE_COUNT = "non_defective_count"  # Nb conformes
       IGNORE = "ignore"                  # Ignorer

Processus de Mapping
--------------------

1. **Analyse des colonnes**

   .. code-block:: python

      @dataclass
      class ColumnMapping:
          source_column: str        # Nom original
          target_role: ColumnRole   # Rôle suggéré
          confidence: float         # Score de confiance (0-1)
          reasoning: str            # Explication
          sample_values: List[str]  # Échantillons
          detected_type: str        # Type détecté

2. **Appel au LLM (Ollama)**

   Le système envoie un prompt structuré :

   .. code-block:: text

      Analyse ces colonnes CSV et suggère le mapping :
      
      Colonnes disponibles :
      - "Nom_Fournisseur" (exemples: "Acme Corp", "Beta Inc")
      - "Date_Prevue" (exemples: "01/01/2026", "15/01/2026")
      - "Date_Reception" (exemples: "03/01/2026", "16/01/2026")
      
      Rôles possibles : supplier, date_promised, date_delivered, ...
      
      Réponds en JSON.

3. **Fallback Pattern Matching**

   Si Ollama n'est pas disponible, le système utilise des expressions régulières :

   .. code-block:: python

      SUPPLIER_PATTERNS = [
          r'supplier', r'vendor', r'fournisseur', r'provider'
      ]
      
      DATE_PROMISED_PATTERNS = [
          r'date_promised', r'promised', r'expected', r'due',
          r'date_prevue', r'echeance'
      ]
      
      DATE_DELIVERED_PATTERNS = [
          r'date_delivered', r'delivered', r'actual', r'received',
          r'date_livraison', r'date_reception'
      ]

Résultat du Mapping
-------------------

.. code-block:: json

   {
     "column_mappings": [
       {
         "source_column": "Nom_Fournisseur",
         "target_role": "supplier",
         "confidence": 0.95,
         "reasoning": "Contient des noms d'entreprises",
         "sample_values": ["Acme Corp", "Beta Inc"],
         "detected_type": "string"
       },
       {
         "source_column": "Date_Prevue",
         "target_role": "date_promised",
         "confidence": 0.90,
         "reasoning": "Format date, nom suggère date prévue",
         "sample_values": ["01/01/2026"],
         "detected_type": "date"
       }
     ]
   }


Normalisation des Données
=========================

Après le mapping, les données sont normalisées.

Conversion des Dates
--------------------

Le système détecte et convertit plusieurs formats :

.. code-block:: python

   # Formats supportés
   DATE_FORMATS = [
       "%Y-%m-%d",      # 2026-01-15
       "%d/%m/%Y",      # 15/01/2026
       "%m/%d/%Y",      # 01/15/2026
       "%d-%m-%Y",      # 15-01-2026
       "%Y/%m/%d",      # 2026/01/15
       "%d %b %Y",      # 15 Jan 2026
       "%d %B %Y",      # 15 January 2026
   ]

Normalisation des Défauts
-------------------------

Les défauts sont normalisés sur l'échelle 0-1 :

.. code-block:: python

   def normalize_defects(value):
       """Normalise les défauts entre 0 et 1"""
       if value > 1:
           # Probablement un pourcentage (ex: 5.2%)
           return value / 100
       return value

**Transformations automatiques** :

.. list-table::
   :widths: 30 30 40
   :header-rows: 1

   * - Valeur entrée
     - Valeur normalisée
     - Logique
   * - ``0.02``
     - ``0.02``
     - Déjà normalisé
   * - ``5.2``
     - ``0.052``
     - Divisé par 100
   * - ``100``
     - ``1.0``
     - Maximum

Calcul du Délai
---------------

Si les colonnes de dates sont présentes, le délai est calculé :

.. code-block:: python

   df["delay"] = (df["date_delivered"] - df["date_promised"]).dt.days
   df["delay"] = df["delay"].apply(lambda x: max(x, 0))  # Minimum 0


Validation des Données
======================

Après normalisation, les données sont validées.

Règles de Validation
--------------------

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Règle
     - Description
   * - **Colonnes requises**
     - Toutes les colonnes du schéma doivent être présentes
   * - **Types de données**
     - Dates valides, nombres dans les plages
   * - **Valeurs non nulles**
     - Supplier ne peut pas être vide
   * - **Plage défauts**
     - defects doit être entre 0.0 et 1.0
   * - **Dates cohérentes**
     - date_delivered >= date_promised (warning si inverse)

Résultat de Validation
----------------------

.. code-block:: python

   @dataclass
   class ValidationWarning:
       severity: str   # "error", "warning", "info"
       message: str
       column: str
       row_count: int
       sample_values: List[str]

Exemple de résultat :

.. code-block:: json

   {
     "warnings": [
       {
         "severity": "warning",
         "message": "15 lignes avec date_delivered < date_promised",
         "column": "date_delivered",
         "row_count": 15,
         "sample_values": ["2026-01-01"]
       },
       {
         "severity": "info",
         "message": "Valeurs défauts converties de pourcentage",
         "column": "defects",
         "row_count": 450
       }
     ]
   }


Traçabilité des Transformations
===============================

Chaque transformation est enregistrée :

.. code-block:: python

   @dataclass
   class TransformationLog:
       column: str        # Colonne concernée
       action: str        # Action effectuée
       details: str       # Détails
       rows_affected: int # Lignes impactées
       timestamp: str     # Horodatage

Exemple :

.. code-block:: json

   {
     "transformations": [
       {
         "column": "defects",
         "action": "normalize_percentage",
         "details": "Divisé par 100 (valeurs > 1 détectées)",
         "rows_affected": 450,
         "timestamp": "2026-01-15T10:30:00"
       },
       {
         "column": "date_promised",
         "action": "parse_date",
         "details": "Converti du format dd/mm/yyyy",
         "rows_affected": 450,
         "timestamp": "2026-01-15T10:30:01"
       }
     ]
   }


Résultat Complet d'Ingestion
============================

.. code-block:: python

   @dataclass
   class IngestionResult:
       success: bool
       dataframe: pd.DataFrame
       column_mappings: List[ColumnMapping]
       transformations: List[TransformationLog]
       warnings: List[ValidationWarning]
       detected_case: str  # "delay_only", "defects_only", "mixed"
       summary: Dict[str, Any]

Exemple JSON :

.. code-block:: json

   {
     "success": true,
     "detected_case": "mixed",
     "summary": {
       "total_rows": 450,
       "total_suppliers": 15,
       "columns_mapped": 4,
       "warnings_count": 2,
       "transformations_count": 3
     },
     "column_mappings": [...],
     "transformations": [...],
     "warnings": [...]
   }


Configuration Ollama
====================

Variables d'Environnement
-------------------------

.. code-block:: ini

   # URL du serveur Ollama
   OLLAMA_BASE_URL=http://localhost:11434

   # Modèle à utiliser
   OLLAMA_MODEL=mistral

Modèles Recommandés
-------------------

.. list-table::
   :widths: 30 20 50
   :header-rows: 1

   * - Modèle
     - Taille
     - Notes
   * - **mistral**
     - 4GB
     - Recommandé, bon équilibre
   * - **llama3**
     - 4GB
     - Alternative performante
   * - **llama3:8b**
     - 8GB
     - Plus précis, plus lent
   * - **phi3**
     - 2GB
     - Léger, moins précis

Vérifier Ollama
---------------

.. code-block:: bash

   # Vérifier que Ollama fonctionne
   curl http://localhost:11434/api/tags

   # Tester un prompt
   curl http://localhost:11434/api/generate \
     -d '{"model": "mistral", "prompt": "Hello"}'


API d'Ingestion
===============

Endpoint Standard
-----------------

.. code-block:: http

   POST /api/workspaces/{workspace_id}/upload HTTP/1.1
   Content-Type: multipart/form-data
   X-User-ID: user-uuid

   file: <fichier.csv>

Endpoint Intelligent (LLM)
--------------------------

.. code-block:: http

   POST /api/workspaces/{workspace_id}/upload-intelligent HTTP/1.1
   Content-Type: multipart/form-data
   X-User-ID: user-uuid

   file: <fichier.csv>

Réponse :

.. code-block:: json

   {
     "success": true,
     "message": "Import réussi avec mapping intelligent",
     "result": {
       "detected_case": "mixed",
       "row_count": 450,
       "supplier_count": 15,
       "mappings": [...],
       "warnings": [...]
     }
   }


Bonnes Pratiques
================

Préparation des Données
-----------------------

1. **Nettoyez les données** avant import (supprimer lignes vides)
2. **Utilisez des noms de colonnes explicites** (le LLM les comprendra mieux)
3. **Vérifiez le format des dates** (cohérence importante)
4. **Normalisez les noms de fournisseurs** (éviter les doublons)

Choix du Mode d'Import
----------------------

- **Import Standard** : Quand vos colonnes correspondent au schéma
- **Import Intelligent** : Quand vos colonnes ont des noms différents

Gestion des Erreurs
-------------------

1. Consultez les warnings retournés
2. Corrigez les données source si nécessaire
3. Réimportez le fichier corrigé


.. seealso::
   - :doc:`guide-utilisateur` pour l'utilisation de l'import
   - :doc:`api` pour les détails techniques des endpoints
