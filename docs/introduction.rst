============
Introduction
============

Présentation du Projet
======================

La **Plateforme d'Analyse Prédictive des Fournisseurs** est une solution SaaS complète 
permettant aux entreprises de surveiller, analyser et prédire les performances de leurs 
fournisseurs.

Construite avec des technologies modernes (FastAPI, Next.js, Supabase), cette plateforme 
offre une expérience utilisateur fluide et des analyses de données puissantes.

.. image:: _static/dashboard-preview.png
   :alt: Aperçu du tableau de bord
   :align: center

*Aperçu du tableau de bord principal*

Objectifs Principaux
====================

🎯 **Analyse des Performances**
   Mesurez les KPIs critiques de vos fournisseurs : taux de retard, taux de défauts,
   score de risque composite et bien plus.

🔮 **Prédictions Avancées**
   Utilisez des algorithmes de Machine Learning pour anticiper les problèmes :
   
   - Moyenne glissante
   - Régression linéaire
   - Lissage exponentiel
   - Modèle combiné

🤖 **Intelligence Artificielle**
   Importez n'importe quel fichier CSV et laissez le système mapper automatiquement
   vos colonnes grâce à l'intégration Ollama (LLM local).

📊 **Tableaux de Bord Personnalisés**
   Créez des espaces de travail dédiés avec des KPIs personnalisés adaptés à vos besoins.

📈 **Rapports & Exports**
   Exportez vos analyses en PDF ou Excel pour les partager avec votre équipe.


Utilisateurs Cibles
===================

Cette plateforme s'adresse à plusieurs profils :

.. list-table::
   :widths: 25 75
   :header-rows: 1

   * - Profil
     - Utilisation
   * - **Responsables Achats**
     - Suivi des performances fournisseurs, évaluation des risques
   * - **Responsables Qualité**
     - Analyse des taux de défauts, suivi des tendances qualité
   * - **Supply Chain Managers**
     - Optimisation de la chaîne d'approvisionnement, prédictions de retard
   * - **Directeurs Opérations**
     - Vue d'ensemble, reporting exécutif, prise de décision
   * - **Administrateurs**
     - Gestion des utilisateurs, supervision globale


Fonctionnalités Clés
====================

Gestion des Espaces de Travail
-------------------------------

Chaque utilisateur peut créer plusieurs **workspaces** (espaces de travail), chacun 
contenant son propre jeu de données et ses paramètres :

* Isolation complète des données entre workspaces
* Support de trois types de données (Cases A, B, C)
* KPIs personnalisés par workspace

Types de Données Supportés
--------------------------

.. list-table::
   :widths: 20 30 50
   :header-rows: 1

   * - Type
     - Nom
     - Description
   * - **Case A**
     - Retards uniquement
     - Données de délais (dates promises vs livrées)
   * - **Case B**
     - Défauts uniquement
     - Données de qualité (taux de défauts)
   * - **Case C**
     - Mixte
     - Combinaison retards + défauts

Système de Prédiction
---------------------

Le système propose 4 méthodes de prédiction :

1. **Moyenne Glissante** : Lissage des données historiques
2. **Régression Linéaire** : Projection basée sur la tendance
3. **Lissage Exponentiel** : Pondération des données récentes
4. **Modèle Combiné** : Moyenne pondérée des trois méthodes


Architecture Technique
======================

La plateforme repose sur une architecture moderne :

* **Backend** : FastAPI (Python 3.11+)
* **Frontend** : Next.js 15 (React)
* **Base de données** : PostgreSQL via Supabase
* **ML** : scikit-learn, pandas, numpy
* **LLM** : Ollama (inférence locale)

Pour plus de détails, consultez la section :doc:`architecture`.


Prochaines Étapes
=================

.. tip::
   Pour commencer à utiliser la plateforme :
   
   1. Consultez le :doc:`guide d'installation <installation>`
   2. Suivez le :doc:`guide utilisateur <guide-utilisateur>`
   3. Explorez les :doc:`fonctionnalités d'import de données <ingestion-donnees>`
