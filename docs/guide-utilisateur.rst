=================
Guide Utilisateur
=================

Ce guide présente les fonctionnalités principales de la plateforme pour les utilisateurs standards.

Authentification
================

Création de Compte
------------------

1. Rendez-vous sur la page d'accueil
2. Cliquez sur **"S'inscrire"** ou **"Sign Up"**
3. Renseignez votre email et mot de passe
4. Confirmez votre email via le lien reçu

.. warning::
   Le mot de passe doit contenir au moins 8 caractères.

Connexion
---------

1. Cliquez sur **"Se connecter"** ou **"Sign In"**
2. Entrez vos identifiants
3. Vous serez redirigé vers le tableau de bord

Déconnexion
-----------

Cliquez sur votre avatar en haut à droite, puis **"Se déconnecter"**.


Tableau de Bord (Dashboard)
===========================

Vue d'Ensemble
--------------

Le tableau de bord présente une vue synthétique de vos données :

.. code-block:: text

   ┌─────────────────────────────────────────────────────────────┐
   │                    TABLEAU DE BORD                          │
   ├─────────────────────────────────────────────────────────────┤
   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
   │  │ Taux    │  │ Taux    │  │ Retard  │  │ Score   │        │
   │  │ Retard  │  │ Défauts │  │ Moyen   │  │ Risque  │        │
   │  │  15%    │  │  3.2%   │  │ 2.5j    │  │  45     │        │
   │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
   │                                                             │
   │  ┌───────────────────────────────────────────────────────┐ │
   │  │                  GRAPHIQUE ÉVOLUTION                  │ │
   │  │                                                       │ │
   │  └───────────────────────────────────────────────────────┘ │
   │                                                             │
   │  ┌──────────────────────┐  ┌──────────────────────┐        │
   │  │ TOP FOURNISSEURS     │  │ ALERTES              │        │
   │  │ À RISQUE             │  │                      │        │
   │  └──────────────────────┘  └──────────────────────┘        │
   └─────────────────────────────────────────────────────────────┘

KPIs Affichés
-------------

.. list-table::
   :widths: 25 75
   :header-rows: 1

   * - KPI
     - Description
   * - **Taux de Retard**
     - Pourcentage de commandes livrées après la date promise
   * - **Taux de Défauts**
     - Pourcentage moyen de défauts sur les livraisons
   * - **Retard Moyen**
     - Nombre moyen de jours de retard (si retard)
   * - **Score Risque Global**
     - Indicateur composite de risque (0-100)
   * - **Taux de Conformité**
     - Pourcentage de commandes parfaites (à temps + sans défaut)


Espaces de Travail (Workspaces)
===============================

Concept
-------

Un **workspace** est un espace isolé contenant :

- Un jeu de données (fichier CSV importé)
- Des KPIs personnalisés
- Des prédictions spécifiques
- Des paramètres de modèle

Chaque utilisateur peut créer plusieurs workspaces pour différents projets ou analyses.

Créer un Workspace
------------------

1. Cliquez sur **"Nouveau Workspace"** dans le menu
2. Renseignez les informations :

   - **Nom** : Nom descriptif (ex: "Analyse Q1 2026")
   - **Description** : Description optionnelle
   - **Type de données** : Sélectionnez le cas adapté

3. Cliquez sur **"Créer"**

Types de Données
----------------

.. list-table::
   :widths: 20 30 50
   :header-rows: 1

   * - Type
     - Nom
     - Colonnes requises
   * - **Case A**
     - Retards
     - supplier, date_promised, date_delivered
   * - **Case B**
     - Défauts
     - supplier, order_date, defects
   * - **Case C**
     - Mixte
     - supplier, date_promised, date_delivered, defects

Gérer les Workspaces
--------------------

- **Modifier** : Cliquez sur l'icône ✏️ pour éditer le nom/description
- **Archiver** : Cliquez sur l'icône 📦 pour archiver (données conservées)
- **Supprimer** : Cliquez sur l'icône 🗑️ pour supprimer définitivement

.. danger::
   La suppression d'un workspace est **irréversible** !


Import de Données
=================

Import Standard
---------------

1. Ouvrez votre workspace
2. Cliquez sur **"Importer des données"**
3. Sélectionnez votre fichier CSV
4. Le système valide automatiquement le format
5. Confirmez l'import

Format CSV Attendu (Case A)
^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: text

   supplier,date_promised,date_delivered,defects
   Fournisseur A,2026-01-01,2026-01-03,0.02
   Fournisseur A,2026-01-05,2026-01-06,0.01
   Fournisseur B,2026-01-02,2026-01-10,0.05

.. tip::
   Téléchargez un fichier exemple depuis l'interface pour voir le format attendu.

Import Intelligent (LLM)
------------------------

L'import intelligent utilise l'IA pour mapper automatiquement vos colonnes :

1. Cliquez sur **"Import Intelligent"**
2. Sélectionnez votre fichier CSV (colonnes quelconques)
3. Le système analyse et propose des mappings
4. Vérifiez et validez les correspondances
5. Confirmez l'import

**Exemple de mapping automatique** :

.. code-block:: text

   Votre colonne          →  Rôle détecté
   ─────────────────────────────────────────
   "Nom_Fournisseur"      →  supplier (95%)
   "Date_Prevue"          →  date_promised (90%)
   "Date_Reception"       →  date_delivered (88%)
   "Taux_Defectueux"      →  defects (85%)

Validation des Données
----------------------

Après l'import, un rapport de validation s'affiche :

- ✅ **Succès** : Données valides et importées
- ⚠️ **Avertissements** : Données importées avec corrections
- ❌ **Erreurs** : Données rejetées (voir détails)


Gestion des Fournisseurs
========================

Liste des Fournisseurs
----------------------

La liste affiche tous les fournisseurs du workspace avec :

- Nom du fournisseur
- Score de risque (badge coloré)
- Taux de retard
- Taux de défauts
- Nombre de commandes
- Dernière commande

Filtrage et Tri
---------------

Utilisez les contrôles pour :

- **Filtrer** par niveau de risque (Faible / Modéré / Élevé)
- **Rechercher** par nom
- **Trier** par score, taux, date

Détail Fournisseur
------------------

Cliquez sur un fournisseur pour voir :

1. **Informations générales**

   - Coordonnées
   - Notes internes

2. **Métriques de performance**

   - Historique des livraisons
   - Évolution des KPIs
   - Graphiques de tendance

3. **Prédictions**

   - Prévision du prochain retard
   - Prévision du taux de défauts

4. **Actions recommandées**

   - Alertes personnalisées
   - Suggestions d'amélioration


KPIs et Prédictions
===================

KPIs Automatiques
-----------------

Le système calcule automatiquement :

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - KPI
     - Calcul
   * - Taux de retard
     - ``(commandes en retard / total commandes) × 100``
   * - Taux de défauts
     - ``moyenne(defects) × 100``
   * - Retard moyen
     - ``moyenne(delay) pour delay > 0``
   * - Score de risque
     - Algorithme composite (voir Architecture)
   * - Volatilité
     - Écart-type des métriques

KPIs Personnalisés
------------------

Créez vos propres KPIs :

1. Cliquez sur **"Ajouter un KPI"**
2. Configurez :

   - **Nom** : Identifiant du KPI
   - **Type** : average, sum, percentage, expression
   - **Formule** : Expression personnalisée
   - **Seuils** : Warning et Critical

**Exemple de formule personnalisée** :

.. code-block:: text

   (taux_retard * 0.6) + (taux_defaut * 0.4)

Variables disponibles :

- ``taux_retard`` : Taux de retard (%)
- ``taux_defaut`` : Taux de défauts (%)
- ``retard_moyen`` : Retard moyen (jours)
- ``nb_commandes`` : Nombre de commandes
- ``delay`` : Retard par commande
- ``defects`` : Défauts par commande

Méthodes de Prédiction
----------------------

Sélectionnez la méthode de prédiction :

1. **Moyenne Glissante**
   
   - Lisse les variations à court terme
   - Paramètre : fenêtre (3-10 périodes)

2. **Régression Linéaire**
   
   - Projette la tendance linéaire
   - Meilleur pour tendances régulières

3. **Lissage Exponentiel**
   
   - Pondère les données récentes
   - Paramètre : alpha (0.1-0.9)

4. **Modèle Combiné**
   
   - Moyenne pondérée des 3 méthodes
   - Plus robuste et stable


Export de Rapports
==================

Export PDF
----------

1. Cliquez sur **"Exporter"** → **"PDF"**
2. Sélectionnez les sections à inclure :

   - ☑️ KPIs globaux
   - ☑️ Liste des fournisseurs
   - ☑️ Graphiques
   - ☑️ Prédictions
   - ☑️ Actions recommandées

3. Cliquez sur **"Générer PDF"**

Export Excel
------------

1. Cliquez sur **"Exporter"** → **"Excel"**
2. Le fichier contient plusieurs onglets :

   - **KPIs** : Indicateurs globaux
   - **Fournisseurs** : Liste détaillée
   - **Données brutes** : Données source
   - **Prédictions** : Valeurs prédites

Filtrage par Fournisseur
------------------------

Vous pouvez filtrer l'export par fournisseur :

1. Sélectionnez un fournisseur dans le dropdown
2. L'export contiendra uniquement ses données


Paramètres Utilisateur
======================

Profil
------

Modifiez vos informations :

- Nom d'affichage
- Email (lecture seule)
- Avatar

Préférences
-----------

Configurez :

- Langue de l'interface
- Fuseau horaire
- Format des dates
- Notifications email


Raccourcis Clavier
==================

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Raccourci
     - Action
   * - ``Ctrl + N``
     - Nouveau workspace
   * - ``Ctrl + U``
     - Upload fichier
   * - ``Ctrl + E``
     - Export rapide
   * - ``Ctrl + F``
     - Rechercher
   * - ``Esc``
     - Fermer modal


Assistance
==========

En cas de problème :

1. Consultez cette documentation
2. Vérifiez la section :doc:`api` pour les erreurs API
3. Contactez votre administrateur

.. seealso::
   - :doc:`ingestion-donnees` pour les détails sur l'import
   - :doc:`api` pour l'intégration technique
