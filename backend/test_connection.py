#!/usr/bin/env python
"""Test de connexion à la base de données"""

import os
import sys
from pathlib import Path

# Ajouter le chemin racine
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.database import test_connection, settings

print("=" * 60)
print("🔍 TEST DE CONNEXION À LA BASE DE DONNÉES")
print("=" * 60)

print("\n📋 Configuration actuelle :")
print(f"   DATABASE_URL : {settings.DATABASE_URL}")
print(f"   Fichier .env : {Path(__file__).parent / '.env'}")

# Test de connexion
print("\n🔄 Tentative de connexion...")
success = test_connection()

if success:
    print("\n✅ Tous les tests sont passés !")
    sys.exit(0)
else:
    print("\n❌ La connexion a échoué")
    print("\n💡 Solutions possibles :")
    print("   1. PostgreSQL est-il lancé ? (sudo service postgresql start)")
    print("   2. Le fichier .env existe-t-il avec DATABASE_URL ?")
    print("   3. Les identifiants sont-ils corrects ?")
    print("   4. La base 'postgres' existe-t-elle ?")
    sys.exit(1)