==========
Glossaire
==========

Définitions des termes utilisés dans la documentation.

A
=

**Admin (Administrateur)**
   Utilisateur disposant de privilèges étendus pour superviser la plateforme.
   Accès en lecture seule aux données des autres utilisateurs.

**API (Application Programming Interface)**
   Interface permettant aux applications de communiquer entre elles.
   La plateforme expose une API REST via FastAPI.

**Audit Log**
   Journal d'enregistrement des actions administratives pour la traçabilité.

C
=

**Case A / Case B / Case C**
   Types de données supportés par la plateforme :
   
   - **Case A** : Données de retard (dates promises/livrées)
   - **Case B** : Données de défauts uniquement
   - **Case C** : Données mixtes (retards + défauts)

**CORS (Cross-Origin Resource Sharing)**
   Mécanisme de sécurité contrôlant les requêtes entre domaines différents.

**CSV (Comma-Separated Values)**
   Format de fichier texte pour les données tabulaires.

D
=

**Dashboard (Tableau de bord)**
   Interface graphique présentant les KPIs et métriques de manière synthétique.

**Défauts**
   Taux de produits défectueux dans une livraison (0.0 à 1.0).

F
=

**FastAPI**
   Framework Python moderne pour construire des APIs REST performantes.

K
=

**KPI (Key Performance Indicator)**
   Indicateur clé de performance mesurant l'efficacité d'un processus.
   Exemples : taux de retard, taux de défauts, score de risque.

L
=

**LLM (Large Language Model)**
   Modèle de langage de grande taille utilisé pour l'analyse intelligente.
   La plateforme utilise Ollama pour le mapping des colonnes CSV.

M
=

**ML (Machine Learning)**
   Apprentissage automatique. Utilisé pour les prédictions de performance.

**Moyenne Glissante**
   Méthode de lissage calculant la moyenne sur une fenêtre de données.

N
=

**Next.js**
   Framework React pour le développement d'applications web modernes.

O
=

**Ollama**
   Outil permettant d'exécuter des LLM localement sans API externe.

P
=

**PostgreSQL**
   Système de gestion de base de données relationnelle open-source.

R
=

**RBAC (Role-Based Access Control)**
   Contrôle d'accès basé sur les rôles (user, admin).

**Régression Linéaire**
   Méthode statistique de prédiction basée sur la tendance linéaire.

**Retard (Delay)**
   Différence en jours entre la date promise et la date de livraison.

**RLS (Row Level Security)**
   Sécurité au niveau des lignes dans PostgreSQL/Supabase.

S
=

**Score de Risque**
   Indicateur composite (0-100) évaluant le risque d'un fournisseur.
   Combine retards, défauts, volatilité et tendances.

**Supabase**
   Plateforme backend-as-a-service basée sur PostgreSQL.

T
=

**Tendance**
   Direction d'évolution d'une métrique : hausse, stable, ou baisse.

V
=

**Volatilité**
   Mesure de la variabilité des performances (écart-type).

W
=

**Workspace (Espace de travail)**
   Container isolé contenant un dataset, des KPIs et des paramètres.
   Chaque utilisateur peut avoir plusieurs workspaces.
