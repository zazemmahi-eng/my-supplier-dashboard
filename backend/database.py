import os
from pathlib import Path
from sqlalchemy import create_engine, text  # ⚠️ AJOUTER : text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings, SettingsConfigDict

# ============================================
# CONFIGURATION DES SETTINGS
# ============================================

# Chemin absolu vers le fichier .env
env_path = Path(__file__).resolve().parent / ".env"

class Settings(BaseSettings):
    """Charge les variables d'environnement depuis le fichier .env"""
    DATABASE_URL: str
    
    # Configuration pour Pydantic V2
    model_config = SettingsConfigDict(
        env_file=str(env_path),
        env_file_encoding='utf-8',
        extra='ignore',
        case_sensitive=False
    )

# ============================================
# CHARGEMENT DES SETTINGS
# ============================================

try:
    settings = Settings()
    print(f"✅ Configuration chargée depuis : {env_path}")
except Exception as e:
    print(f"❌ ERREUR: Impossible de charger les settings.")
    print(f"📁 Chemin recherché : {env_path}")
    print(f"⚠️ Vérifiez que le fichier .env existe et contient DATABASE_URL")
    print(f"🔴 Erreur Pydantic: {e}")
    exit(1)

# ============================================
# CONFIGURATION SQLALCHEMY
# ============================================

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Créer le moteur SQLAlchemy
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=False,  # Mettre True pour voir les requêtes SQL
    pool_pre_ping=True,  # Vérifie la connexion avant utilisation
    pool_size=5,
    max_overflow=10
)

# Créer une session locale
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base déclarative pour les modèles
Base = declarative_base()

# ============================================
# DÉPENDANCE FASTAPI
# ============================================

def get_db():
    """
    Générateur de session de base de données
    À utiliser avec Depends() dans FastAPI
    
    Usage:
        @app.get("/endpoint")
        async def endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================
# FONCTION DE TEST - CORRIGÉE
# ============================================

def test_connection():
    """Teste la connexion à la base de données"""
    try:
        db = SessionLocal()
        # ⚠️ CORRECTION : Utiliser text() pour les requêtes SQL brutes
        result = db.execute(text("SELECT 1")).scalar()
        db.close()
        print(f"✅ Connexion à la base de données réussie (test: {result})")
        return True
    except Exception as e:
        print(f"❌ Erreur de connexion à la base de données : {e}")
        return False

# ============================================
# INITIALISATION DES TABLES
# ============================================

def init_db():
    """
    Crée toutes les tables définies dans les modèles
    À appeler au démarrage de l'application
    """
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Tables de base de données créées/vérifiées")
    except Exception as e:
        print(f"❌ Erreur lors de la création des tables : {e}")