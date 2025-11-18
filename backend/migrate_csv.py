"""
Script de migration CSV vers la base de données PostgreSQL
Usage: python -m backend.migrate_csv
Ou depuis la racine: python backend/migrate_csv.py
"""

import pandas as pd
from pathlib import Path
import sys

# Ajouter le chemin racine au PYTHONPATH pour les imports
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

# Imports avec préfixe backend.
from backend.database import SessionLocal, engine, Base
from backend.models import Supplier, Order

# ============================================
# CONFIGURATION
# ============================================

# Chemin vers le fichier CSV
CSV_FILE = Path(__file__).parent / "donnees.csv"

# ============================================
# FONCTIONS UTILITAIRES
# ============================================

def create_suppliers(db, supplier_names):
    """Crée ou récupère les fournisseurs"""
    supplier_map = {}
    
    print("\n📦 Étape 1: Vérification/Création des fournisseurs...")
    print("-" * 60)
    
    for name in supplier_names:
        supplier = db.query(Supplier).filter(Supplier.name == name).first()
        
        if not supplier:
            print(f"  ➕ Création du fournisseur : {name}")
            supplier = Supplier(
                name=name,
                email=f"contact@fournisseur-{name.lower()}.com",
                phone=f"+212 6{ord(name) - ord('A')}0 000 000",
                address=f"Adresse du fournisseur {name}",
                quality_rating=5,
                delivery_rating=5,
                notes=f"Fournisseur {name} (importé depuis CSV)"
            )
            db.add(supplier)
            db.commit()
            db.refresh(supplier)
            print(f"     ✅ Fournisseur {name} créé (ID: {supplier.id})")
        else:
            print(f"  ℹ️  Fournisseur {name} existe déjà (ID: {supplier.id})")
        
        supplier_map[name] = supplier.id
    
    print(f"\n✅ {len(supplier_map)} fournisseurs prêts")
    return supplier_map

def load_csv(csv_path):
    """Charge le fichier CSV"""
    print("\n📄 Étape 2: Lecture du fichier CSV...")
    print("-" * 60)
    
    if not csv_path.exists():
        print(f"❌ ERREUR: Fichier introuvable : {csv_path}")
        print(f"   Chemin recherché : {csv_path.absolute()}")
        return None
    
    try:
        df = pd.read_csv(csv_path)
        print(f"✅ Fichier chargé : {len(df)} lignes")
        print(f"   Colonnes : {list(df.columns)}")
        return df
    except Exception as e:
        print(f"❌ Erreur lors de la lecture du CSV : {e}")
        return None

def migrate_orders(db, df, supplier_map):
    """Migre les commandes du CSV vers la base de données"""
    print("\n📦 Étape 3: Migration des commandes...")
    print("-" * 60)
    
    orders_to_add = []
    skipped = 0
    duplicates = 0
    
    for idx, row in df.iterrows():
        supplier_name = str(row['supplier']).strip()
        
        # Vérifier que le fournisseur existe
        if supplier_name not in supplier_map:
            print(f"⚠️  Ligne {idx + 2}: Fournisseur '{supplier_name}' inconnu. Ignorée.")
            skipped += 1
            continue
        
        try:
            # Convertir les dates
            date_promised = pd.to_datetime(row['date_promised']).date()
            date_delivered = pd.to_datetime(row['date_delivered']).date() if pd.notna(row['date_delivered']) else None
            defects = float(row['defects']) if pd.notna(row['defects']) else 0.0
            
            # Vérifier si la commande existe déjà
            existing_order = db.query(Order).filter(
                Order.supplier_id == supplier_map[supplier_name],
                Order.date_promised == date_promised
            ).first()
            
            if existing_order:
                duplicates += 1
                continue
            
            # Créer la nouvelle commande
            order = Order(
                supplier_id=supplier_map[supplier_name],
                date_promised=date_promised,
                date_delivered=date_delivered,
                defects=defects,
                order_reference=f"CSV-{supplier_name}-{idx + 1}",
                notes="Importé depuis CSV"
            )
            orders_to_add.append(order)
            
        except Exception as e:
            print(f"⚠️  Ligne {idx + 2}: Erreur de conversion - {e}")
            skipped += 1
            continue
    
    # Statistiques
    print(f"\n📊 Statistiques :")
    print(f"   - Nouvelles commandes : {len(orders_to_add)}")
    print(f"   - Doublons ignorés : {duplicates}")
    print(f"   - Lignes invalides : {skipped}")
    
    return orders_to_add

def save_orders(db, orders):
    """Sauvegarde les commandes dans la base de données"""
    if not orders:
        print("\n✅ Aucune nouvelle commande à ajouter.")
        return True
    
    print("\n💾 Étape 4: Enregistrement dans la base de données...")
    print("-" * 60)
    
    try:
        db.bulk_save_objects(orders)
        db.commit()
        print(f"✅ {len(orders)} commandes ajoutées avec succès !")
        return True
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de l'enregistrement : {e}")
        return False

# ============================================
# FONCTION PRINCIPALE
# ============================================

def main():
    """Point d'entrée principal"""
    print("=" * 60)
    print("🚀 MIGRATION CSV → BASE DE DONNÉES POSTGRESQL")
    print("=" * 60)
    
    # Créer les tables si elles n'existent pas
    print("\n🔧 Vérification de la base de données...")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Tables vérifiées/créées")
    except Exception as e:
        print(f"❌ Erreur de connexion à la base : {e}")
        print("   Vérifiez votre fichier .env et que PostgreSQL est lancé")
        return False
    
    # Créer une session
    db = SessionLocal()
    
    try:
        # Définir les fournisseurs à créer
        supplier_names = ['A', 'B', 'C', 'D', 'E', 'F']
        
        # Étape 1 : Créer/récupérer les fournisseurs
        supplier_map = create_suppliers(db, supplier_names)
        
        # Étape 2 : Charger le CSV
        df = load_csv(CSV_FILE)
        if df is None:
            return False
        
        # Étape 3 : Préparer les commandes
        orders = migrate_orders(db, df, supplier_map)
        
        # Étape 4 : Sauvegarder
        success = save_orders(db, orders)
        
        if success:
            # Afficher les statistiques finales
            print("\n" + "=" * 60)
            print("📊 STATISTIQUES FINALES")
            print("=" * 60)
            
            supplier_count = db.query(Supplier).count()
            order_count = db.query(Order).count()
            
            print(f"   Total fournisseurs : {supplier_count}")
            print(f"   Total commandes    : {order_count}")
            
            print("\n" + "=" * 60)
            print("✅ MIGRATION TERMINÉE AVEC SUCCÈS")
            print("=" * 60)
            return True
        else:
            print("\n❌ La migration a échoué")
            return False
    
    except Exception as e:
        print(f"\n❌ Erreur inattendue : {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        db.close()
        print("\n🔒 Connexion à la base de données fermée")

# ============================================
# POINT D'ENTRÉE
# ============================================

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)