"""
Script pour réinitialiser complètement la base de données
Usage: python backend/reset_database.py
"""

import sys
from pathlib import Path

# Ajouter le chemin racine au PYTHONPATH
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from backend.database import engine, Base
from backend.models import Supplier, Order, Account

def reset_database():
    """Supprime et recrée toutes les tables"""
    print("=" * 60)
    print("⚠️  RÉINITIALISATION COMPLÈTE DE LA BASE DE DONNÉES")
    print("=" * 60)
    
    confirmation = input("\n⚠️  Attention : Toutes les données seront supprimées!\nTapez 'CONFIRMER' pour continuer : ")
    
    if confirmation != "CONFIRMER":
        print("\n❌ Opération annulée")
        return False
    
    try:
        print("\n🗑️  Suppression de toutes les tables...")
        Base.metadata.drop_all(bind=engine)
        print("✅ Tables supprimées")
        
        print("\n🔨 Création des nouvelles tables avec le schéma correct...")
        Base.metadata.create_all(bind=engine)
        print("✅ Tables créées avec succès")
        
        print("\n" + "=" * 60)
        print("✅ BASE DE DONNÉES RÉINITIALISÉE")
        print("=" * 60)
        print("\nVous pouvez maintenant lancer : python backend/migrate_csv.py")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Erreur : {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = reset_database()
    sys.exit(0 if success else 1)