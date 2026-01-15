# Documentation - Plateforme d'Analyse des Fournisseurs

Cette documentation est générée avec [Sphinx](https://www.sphinx-doc.org/) 
et utilise le thème [Read the Docs](https://sphinx-rtd-theme.readthedocs.io/).

## Structure

```
docs/
├── conf.py              # Configuration Sphinx
├── index.rst            # Page d'accueil
├── introduction.rst     # Introduction au projet
├── architecture.rst     # Architecture technique
├── installation.rst     # Guide d'installation
├── guide-utilisateur.rst # Guide utilisateur
├── guide-admin.rst      # Guide administrateur
├── ingestion-donnees.rst # Import de données & LLM
├── api.rst              # Documentation API
├── securite.rst         # Sécurité & contrôle d'accès
├── deploiement.rst      # Guide de déploiement
├── changelog.rst        # Historique des versions
├── glossaire.rst        # Glossaire des termes
├── requirements.txt     # Dépendances Python pour Sphinx
├── Makefile             # Build sur Linux/macOS
├── make.bat             # Build sur Windows
└── _static/
    └── custom.css       # Styles personnalisés
```

## Installation des dépendances

```bash
# Créer un environnement virtuel (optionnel)
python -m venv venv
source venv/bin/activate  # Linux/macOS
# ou
venv\Scripts\activate     # Windows

# Installer les dépendances
pip install -r requirements.txt
```

## Construire la documentation

### Windows

```batch
cd docs
make.bat html
```

### Linux / macOS

```bash
cd docs
make html
```

La documentation générée sera disponible dans `docs/_build/html/`.

## Serveur de développement

Pour un rechargement automatique pendant l'édition :

```bash
pip install sphinx-autobuild
sphinx-autobuild docs docs/_build/html
```

La documentation sera accessible à `http://localhost:8000`.

## Déploiement sur Read the Docs

1. Créez un compte sur [readthedocs.org](https://readthedocs.org/)
2. Importez votre projet depuis GitHub
3. La configuration `.readthedocs.yaml` sera automatiquement détectée
4. La documentation sera construite et publiée automatiquement

## Contribution

Pour contribuer à la documentation :

1. Modifiez les fichiers `.rst` correspondants
2. Construisez localement pour vérifier
3. Soumettez une Pull Request

## Syntaxe reStructuredText

Quelques exemples de syntaxe :

```rst
# Titre niveau 1
==================

## Titre niveau 2
------------------

**Gras** et *italique*

``code inline``

.. code-block:: python

   def example():
       pass

.. note::
   Une note importante

.. warning::
   Un avertissement

- Liste à puces
- Élément 2

1. Liste numérotée
2. Élément 2
```

## Support

Pour toute question sur la documentation, ouvrez une issue sur le repository.
