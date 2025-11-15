from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import sys
import os

# Ajouter le répertoire parent au chemin Python
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from backend.mon_analyse import (
        calculer_kpis_globaux,
        calculer_risques_fournisseurs,
        obtenir_actions_recommandees,
        calculer_predictions,
        obtenir_detail_fournisseur,
        calculer_stats_periode
    )
except ModuleNotFoundError as e:
    print(f"⚠️ Avertissement : Module mon_analyse non trouvé - {e}")
    print("L'API fonctionnera en mode limité")
    
    # Fonctions de secours (placeholders)
    def calculer_kpis_globaux():
        return {"message": "Module non disponible"}
    def calculer_risques_fournisseurs():
        return []
    def obtenir_actions_recommandees():
        return []
    def calculer_predictions(fenetre=3):
        return []
    def obtenir_detail_fournisseur(name):
        return None
    def calculer_stats_periode(jours=30):
        return {}

# ---------------------------------------------------------
# Configuration FastAPI
# ---------------------------------------------------------

app = FastAPI(
    title="API Tableau de Bord Fournisseurs",
    version="2.0.0",
    description="API d'analyse prédictive des retards et défauts fournisseurs"
)

# CORS
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Modèles Pydantic
# ---------------------------------------------------------

class SupplierCreate(BaseModel):
    """Modèle pour créer un fournisseur (statique pour l'instant)"""
    name: str
    contact_email: str
    contact_phone: str
    address: str
    quality_rating: float = 5.0
    delivery_rating: float = 5.0
    notes: str = ""

# ---------------------------------------------------------
# Endpoints
# ---------------------------------------------------------

@app.get("/")
async def root():
    """Point d'entrée de l'API"""
    return {
        "message": "API Tableau de Bord Fournisseurs",
        "version": "2.0.0",
        "endpoints": {
            "dashboard": "/api/dashboard/data",
            "predictions": "/api/predictions",
            "supplier_detail": "/api/supplier/{name}",
            "stats": "/api/stats",
            "actions": "/api/actions"
        }
    }

@app.get("/api/dashboard/data", response_model=Dict[str, Any])
async def get_dashboard_data():
    """
    Endpoint principal : KPIs + fournisseurs + actions
    """
    try:
        kpis = calculer_kpis_globaux()
        suppliers = calculer_risques_fournisseurs()
        actions = obtenir_actions_recommandees()

        return {
            "kpis_globaux": kpis,
            "suppliers": suppliers,
            "actions": actions,
            "timestamp": "2024-11-11T10:00:00"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/predictions", response_model=Dict[str, Any])
async def get_predictions(fenetre: int = Query(3, ge=1, le=10)):
    """
    Prédictions par moyenne glissante
    - fenetre : taille de la fenêtre (défaut: 3)
    """
    try:
        predictions = calculer_predictions(fenetre=fenetre)
        return {
            "predictions": predictions,
            "fenetre": fenetre,
            "methode": "moyenne_glissante"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/supplier/{supplier_name}", response_model=Dict[str, Any])
async def get_supplier_detail(supplier_name: str):
    """
    Détail d'un fournisseur spécifique
    """
    try:
        detail = obtenir_detail_fournisseur(supplier_name)
        
        if not detail:
            raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier_name}' introuvable")
        
        return detail
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/actions", response_model=Dict[str, Any])
async def get_actions():
    """
    Liste des actions recommandées
    """
    try:
        actions = obtenir_actions_recommandees()
        
        # Grouper par priorité
        high_priority = [a for a in actions if a.get("priority") == "high"]
        medium_priority = [a for a in actions if a.get("priority") == "medium"]
        low_priority = [a for a in actions if a.get("priority") == "low"]
        
        return {
            "total_actions": len(actions),
            "high_priority": high_priority,
            "medium_priority": medium_priority,
            "low_priority": low_priority
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/stats", response_model=Dict[str, Any])
async def get_stats(periode: int = Query(30, ge=1, le=365)):
    """
    Statistiques sur une période donnée
    - periode : nombre de jours (défaut: 30)
    """
    try:
        stats = calculer_stats_periode(jours=periode)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/suppliers/list", response_model=Dict[str, Any])
async def get_suppliers_list():
    """
    Liste simple de tous les fournisseurs
    """
    try:
        suppliers = calculer_risques_fournisseurs()
        suppliers_list = [
            {
                "name": s.get("supplier", "unknown"),
                "status": s.get("status", "unknown"),
                "score": s.get("score_risque", 0)
            }
            for s in suppliers
        ]
        
        return {
            "count": len(suppliers_list),
            "suppliers": suppliers_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

# ---------------------------------------------------------
# Endpoints statiques (sans BDD)
# ---------------------------------------------------------

# Stockage en mémoire (temporaire)
fake_suppliers_db = {}

@app.post("/api/supplier/create")
async def create_supplier(supplier: SupplierCreate):
    """
    Création d'un fournisseur (stockage temporaire en mémoire)
    """
    if supplier.name in fake_suppliers_db:
        raise HTTPException(status_code=400, detail="Ce fournisseur existe déjà")
    
    fake_suppliers_db[supplier.name] = {
        "name": supplier.name,
        "contact_email": supplier.contact_email,
        "contact_phone": supplier.contact_phone,
        "address": supplier.address,
        "quality_rating": supplier.quality_rating,
        "delivery_rating": supplier.delivery_rating,
        "notes": supplier.notes,
        "created_at": "2024-11-11"
    }
    
    return {
        "message": f"Fournisseur '{supplier.name}' créé avec succès",
        "supplier": fake_suppliers_db[supplier.name],
        "note": "⚠️ Données stockées en mémoire (non persistantes)"
    }

@app.get("/api/supplier/static/list")
async def get_static_suppliers():
    """
    Liste des fournisseurs créés manuellement (en mémoire)
    """
    return {
        "count": len(fake_suppliers_db),
        "suppliers": list(fake_suppliers_db.values()),
        "note": "Données non persistantes"
    }

@app.delete("/api/supplier/static/{name}")
async def delete_static_supplier(name: str):
    """
    Supprime un fournisseur du stockage temporaire
    """
    if name not in fake_suppliers_db:
        raise HTTPException(status_code=404, detail=f"Fournisseur '{name}' introuvable")
    
    del fake_suppliers_db[name]
    
    return {
        "message": f"Fournisseur '{name}' supprimé",
        "remaining": len(fake_suppliers_db)
    }

# ---------------------------------------------------------
# Health Check
# ---------------------------------------------------------

@app.get("/health")
async def health_check():
    """Vérification de l'état de l'API"""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "timestamp": "2024-11-11"
    }