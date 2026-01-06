#main.py
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from datetime import datetime, date
import uuid

from backend.mon_analyse import (
    charger_donnees,
    calculer_kpis_globaux,
    calculer_risques_fournisseurs,
    obtenir_actions_recommandees,
    calculer_predictions_avancees,
    obtenir_detail_fournisseur,
    calculer_stats_periode,
    calculer_distribution_risques,
    comparer_methodes_prediction
)

from backend.models import Supplier, Order, Account
from backend.database import get_db, init_db
from backend.upload_routes import router as upload_router, get_uploaded_data

# ============================================
# CONFIGURATION FASTAPI
# ============================================

init_db()

app = FastAPI(
    title="API Fournisseurs - Analyse Prédictive Avancée",
    version="3.0.0",
    description="Backend avec prédictions avancées (Moyenne Glissante + Régression Linéaire + Exponentielle Lissée)"
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include upload router
app.include_router(upload_router)

# ============================================
# MODÈLES PYDANTIC
# ============================================

class SupplierBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    quality_rating: Optional[int] = 5
    delivery_rating: Optional[int] = 5
    notes: Optional[str] = None

class SupplierCreate(SupplierBase):
    pass

class SupplierRead(SupplierBase):
    id: uuid.UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class OrderCreate(BaseModel):
    supplier_id: uuid.UUID
    date_promised: date
    date_delivered: Optional[date] = None
    defects: float = 0.0
    order_reference: Optional[str] = None
    quantity: Optional[int] = None
    amount: Optional[float] = None
    notes: Optional[str] = None

class OrderRead(BaseModel):
    id: uuid.UUID
    supplier_id: uuid.UUID
    date_promised: datetime
    date_delivered: Optional[datetime]
    defects: float
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# ============================================
# ÉVÉNEMENT DE DÉMARRAGE
# ============================================

@app.on_event("startup")
async def startup_event():
    """Vérifie la connexion à la base de données au démarrage"""
    print("🚀 Démarrage de l'API Fournisseurs v3.0...")
    try:
        db = next(get_db())
        supplier_count = db.query(Supplier).count()
        order_count = db.query(Order).count()
        print(f"✅ Connexion réussie : {supplier_count} fournisseurs, {order_count} commandes")
        print(f"📊 Prédictions: Moyenne Glissante + Régression Linéaire + Exponentielle Lissée")
        db.close()
    except Exception as e:
        print(f"⚠️ Attention : Problème de connexion : {e}")

# ============================================
# ENDPOINTS DE BASE
# ============================================

@app.get("/")
async def root():
    return {
        "message": "API Fournisseurs - Analyse Prédictive Avancée",
        "version": "3.0.0",
        "features": [
            "KPIs globaux",
            "Scoring de risque",
            "Prédictions avancées (3 méthodes)",
            "Distribution des risques",
            "Actions recommandées",
            "Comparaison méthodes"
        ]
    }

@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check avec vérification de la base de données"""
    try:
        supplier_count = db.query(Supplier).count()
        order_count = db.query(Order).count()
        
        return {
            "status": "healthy",
            "version": "3.0.0",
            "timestamp": datetime.now(),
            "database": {
                "status": "connected",
                "suppliers": supplier_count,
                "orders": order_count
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

# ============================================
# DASHBOARD (ANALYTICS)
# ============================================

@app.get("/api/dashboard/data", response_model=Dict[str, Any])
async def get_dashboard_data(db: Session = Depends(get_db)):
    """Endpoint principal du dashboard - utilise uploaded data si disponible"""
    try:
        # Check for uploaded data first
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        
        kpis = calculer_kpis_globaux(df)
        risques = calculer_risques_fournisseurs(df)
        actions = obtenir_actions_recommandees(risques)

        return {
            "kpis_globaux": kpis,
            "suppliers": risques,
            "actions": actions,
            "timestamp": datetime.now().isoformat(),
            "data_source": "uploaded" if uploaded_df is not None else "database"
        }
    except Exception as e:
        print(f"❌ Erreur dans get_dashboard_data: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/predictions", response_model=Dict[str, Any])
async def get_predictions(
    fenetre: int = Query(3, ge=1, le=10), 
    db: Session = Depends(get_db)
):
    """Prédictions avancées (3 méthodes combinées)"""
    try:
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        predictions = calculer_predictions_avancees(df, fenetre=fenetre)
        return {
            "predictions": predictions,
            "fenetre": fenetre,
            "methodes": [
                "moyenne_glissante",
                "regression_lineaire",
                "exponentielle_lissee"
            ],
            "note": "Les 3 méthodes sont combinées pour une prédiction plus robuste"
        }
    except Exception as e:
        print(f"❌ Erreur dans get_predictions: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/predictions/compare/{supplier_name}", response_model=Dict[str, Any])
async def compare_prediction_methods(supplier_name: str, db: Session = Depends(get_db)):
    """Compare les 3 méthodes de prédiction pour un fournisseur"""
    try:
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        comparison = comparer_methodes_prediction(df, supplier_name)
        
        if not comparison:
            raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier_name}' non trouvé")
        
        return comparison
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erreur dans compare_prediction_methods: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/supplier/{supplier_name}", response_model=Dict[str, Any])
async def get_supplier_detail(supplier_name: str, db: Session = Depends(get_db)):
    """Détail d'un fournisseur spécifique"""
    try:
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        detail = obtenir_detail_fournisseur(df, supplier_name)
        
        if not detail:
            raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier_name}' introuvable")
        
        return detail
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erreur dans get_supplier_detail: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/actions", response_model=Dict[str, Any])
async def get_actions(db: Session = Depends(get_db)):
    """Liste des actions recommandées groupées par priorité"""
    try:
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        risques = calculer_risques_fournisseurs(df)
        actions = obtenir_actions_recommandees(risques)
        
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
        print(f"❌ Erreur dans get_actions: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/distribution", response_model=Dict[str, Any])
async def get_distribution(db: Session = Depends(get_db)):
    """Distribution des niveaux de risque"""
    try:
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        risques = calculer_risques_fournisseurs(df)
        distribution = calculer_distribution_risques(risques)
        
        return {
            "distribution": distribution,
            "total_suppliers": len(risques)
        }
    except Exception as e:
        print(f"❌ Erreur dans get_distribution: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/stats", response_model=Dict[str, Any])
async def get_stats(
    periode: int = Query(30, ge=1, le=365), 
    db: Session = Depends(get_db)
):
    """Statistiques sur une période donnée"""
    try:
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        stats = calculer_stats_periode(df, jours=periode)
        return stats
    except Exception as e:
        print(f"❌ Erreur dans get_stats: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/suppliers/list", response_model=Dict[str, Any])
async def get_suppliers_list(db: Session = Depends(get_db)):
    """Liste simple de tous les fournisseurs"""
    try:
        uploaded_df = get_uploaded_data()
        if uploaded_df is not None and not uploaded_df.empty:
            df = uploaded_df
        else:
            df = charger_donnees(db)
        suppliers = calculer_risques_fournisseurs(df)
        
        suppliers_list = [
            {
                "name": s.get("supplier"),
                "status": s.get("status"),
                "score": s.get("score_risque")
            }
            for s in suppliers
        ]
        
        return {
            "count": len(suppliers_list),
            "suppliers": suppliers_list
        }
    except Exception as e:
        print(f"❌ Erreur dans get_suppliers_list: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

# ============================================
# CRUD FOURNISSEURS
# ============================================

@app.post("/api/supplier/create", response_model=SupplierRead)
async def create_supplier(
    supplier: SupplierCreate, 
    db: Session = Depends(get_db)
):
    """Création d'un fournisseur"""
    try:
        existing = db.query(Supplier).filter(Supplier.name == supplier.name).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Le fournisseur '{supplier.name}' existe déjà")
        
        new_supplier = Supplier(**supplier.model_dump())
        db.add(new_supplier)
        db.commit()
        db.refresh(new_supplier)
        
        print(f"✅ Fournisseur créé : {new_supplier.name}")
        return new_supplier
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de la création: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/supplier/static/list", response_model=List[SupplierRead])
async def get_static_suppliers(db: Session = Depends(get_db)):
    """Liste des fournisseurs en base de données"""
    try:
        suppliers = db.query(Supplier).all()
        return suppliers
    except Exception as e:
        print(f"❌ Erreur dans get_static_suppliers: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.delete("/api/supplier/static/{name}", response_model=Dict[str, str])
async def delete_static_supplier(name: str, db: Session = Depends(get_db)):
    """Supprime un fournisseur"""
    try:
        db_supplier = db.query(Supplier).filter(Supplier.name == name).first()
        
        if not db_supplier:
            raise HTTPException(status_code=404, detail=f"Fournisseur '{name}' introuvable")
        
        order_count = db.query(Order).filter(Order.supplier_id == db_supplier.id).count()
        
        if order_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Impossible de supprimer '{name}' : {order_count} commande(s) associée(s)"
            )
        
        db.delete(db_supplier)
        db.commit()
        
        print(f"✅ Fournisseur supprimé : {name}")
        return {"message": f"Fournisseur '{name}' supprimé"}
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de la suppression: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

# ============================================
# CRUD COMMANDES
# ============================================

@app.post("/api/order/create", response_model=OrderRead)
async def create_order(
    order: OrderCreate,
    db: Session = Depends(get_db)
):
    """Créer une nouvelle commande"""
    try:
        supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Fournisseur introuvable")
        
        new_order = Order(**order.model_dump())
        db.add(new_order)
        db.commit()
        db.refresh(new_order)
        
        print(f"✅ Commande créée pour {supplier.name}")
        return new_order
    
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de la création: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.get("/api/orders/list")
async def get_orders_list(
    supplier_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db)
):
    """Liste des commandes"""
    try:
        query = db.query(Order)
        
        if supplier_id:
            query = query.filter(Order.supplier_id == supplier_id)
        
        orders = query.order_by(Order.date_promised.desc()).all()
        
        return {
            "count": len(orders),
            "orders": orders
        }
    except Exception as e:
        print(f"❌ Erreur dans get_orders_list: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

# ============================================
# DONNÉES DE DÉMONSTRATION
# ============================================

@app.post("/api/demo/populate")
async def populate_demo_data(db: Session = Depends(get_db)):
    """Insère des données de démonstration"""
    try:
        existing_count = db.query(Supplier).count()
        if existing_count > 0:
            return {
                "message": "Des données existent déjà",
                "suppliers": existing_count,
                "note": "Utilisez DELETE /api/demo/reset pour réinitialiser"
            }
        
        suppliers_data = [
            {"name": "Fournisseur A", "email": "a@example.com", "quality_rating": 8, "delivery_rating": 7},
            {"name": "Fournisseur B (Dérive)", "email": "b@example.com", "quality_rating": 6, "delivery_rating": 5},
            {"name": "Fournisseur C", "email": "c@example.com", "quality_rating": 9, "delivery_rating": 9},
            {"name": "Fournisseur D (Retards)", "email": "d@example.com", "quality_rating": 5, "delivery_rating": 3},
            {"name": "Fournisseur E", "email": "e@example.com", "quality_rating": 7, "delivery_rating": 6},
            {"name": "Fournisseur F", "email": "f@example.com", "quality_rating": 6, "delivery_rating": 6},
        ]
        
        created_suppliers = []
        for s_data in suppliers_data:
            supplier = Supplier(**s_data)
            db.add(supplier)
            created_suppliers.append(supplier)
        
        db.commit()
        
        for supplier in created_suppliers:
            db.refresh(supplier)
        
        # Scénario 1: Fournisseur A stable (bon)
        orders_a = [
            {"supplier_id": created_suppliers[0].id, "date_promised": date(2024, 1, 1), "date_delivered": date(2024, 1, 2), "defects": 0.01},
            {"supplier_id": created_suppliers[0].id, "date_promised": date(2024, 1, 5), "date_delivered": date(2024, 1, 5), "defects": 0.01},
            {"supplier_id": created_suppliers[0].id, "date_promised": date(2024, 1, 10), "date_delivered": date(2024, 1, 11), "defects": 0.00},
            {"supplier_id": created_suppliers[0].id, "date_promised": date(2024, 1, 15), "date_delivered": date(2024, 1, 16), "defects": 0.02},
        ]
        
        # Scénario 2: Fournisseur B - DÉRIVE QUALITÉ (Défauts augmentent)
        orders_b = [
            {"supplier_id": created_suppliers[1].id, "date_promised": date(2024, 1, 2), "date_delivered": date(2024, 1, 3), "defects": 0.02},
            {"supplier_id": created_suppliers[1].id, "date_promised": date(2024, 1, 8), "date_delivered": date(2024, 1, 9), "defects": 0.04},
            {"supplier_id": created_suppliers[1].id, "date_promised": date(2024, 1, 15), "date_delivered": date(2024, 1, 16), "defects": 0.07},
            {"supplier_id": created_suppliers[1].id, "date_promised": date(2024, 1, 22), "date_delivered": date(2024, 1, 23), "defects": 0.10},
        ]
        
        # Scénario 3: Fournisseur C excellent
        orders_c = [
            {"supplier_id": created_suppliers[2].id, "date_promised": date(2024, 1, 3), "date_delivered": date(2024, 1, 3), "defects": 0.00},
            {"supplier_id": created_suppliers[2].id, "date_promised": date(2024, 1, 10), "date_delivered": date(2024, 1, 10), "defects": 0.00},
            {"supplier_id": created_suppliers[2].id, "date_promised": date(2024, 1, 17), "date_delivered": date(2024, 1, 17), "defects": 0.00},
            {"supplier_id": created_suppliers[2].id, "date_promised": date(2024, 1, 24), "date_delivered": date(2024, 1, 24), "defects": 0.01},
        ]
        
        # Scénario 4: Fournisseur D - RETARDS (Délais augmentent au milieu)
        orders_d = [
            {"supplier_id": created_suppliers[3].id, "date_promised": date(2024, 1, 5), "date_delivered": date(2024, 1, 5), "defects": 0.02},
            {"supplier_id": created_suppliers[3].id, "date_promised": date(2024, 1, 12), "date_delivered": date(2024, 1, 16), "defects": 0.03},
            {"supplier_id": created_suppliers[3].id, "date_promised": date(2024, 1, 19), "date_delivered": date(2024, 1, 26), "defects": 0.02},
            {"supplier_id": created_suppliers[3].id, "date_promised": date(2024, 1, 26), "date_delivered": date(2024, 2, 2), "defects": 0.03},
        ]
        
        # Autres fournisseurs
        orders_e = [
            {"supplier_id": created_suppliers[4].id, "date_promised": date(2024, 1, 4), "date_delivered": date(2024, 1, 4), "defects": 0.01},
            {"supplier_id": created_suppliers[4].id, "date_promised": date(2024, 1, 11), "date_delivered": date(2024, 1, 12), "defects": 0.02},
            {"supplier_id": created_suppliers[4].id, "date_promised": date(2024, 1, 18), "date_delivered": date(2024, 1, 18), "defects": 0.01},
        ]
        
        orders_f = [
            {"supplier_id": created_suppliers[5].id, "date_promised": date(2024, 1, 6), "date_delivered": date(2024, 1, 7), "defects": 0.03},
            {"supplier_id": created_suppliers[5].id, "date_promised": date(2024, 1, 13), "date_delivered": date(2024, 1, 14), "defects": 0.02},
            {"supplier_id": created_suppliers[5].id, "date_promised": date(2024, 1, 20), "date_delivered": date(2024, 1, 21), "defects": 0.03},
        ]
        
        all_orders = orders_a + orders_b + orders_c + orders_d + orders_e + orders_f
        
        for o_data in all_orders:
            order = Order(**o_data)
            db.add(order)
        
        db.commit()
        
        supplier_count = db.query(Supplier).count()
        order_count = db.query(Order).count()
        
        return {
            "message": "✅ Données de démonstration avec scénarios réalistes",
            "suppliers_created": supplier_count,
            "orders_created": order_count,
            "scenarios": {
                "fournisseur_a": "Stable et fiable",
                "fournisseur_b": "⚠️ DÉRIVE: Défauts augmentent progressivement",
                "fournisseur_c": "Excellent partenaire",
                "fournisseur_d": "⚠️ RETARDS: Délais augmentent au milieu de la période",
                "fournisseur_e": "Normal",
                "fournisseur_f": "Normal"
            }
        }
    
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de l'insertion: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")

@app.delete("/api/demo/reset")
async def reset_demo_data(db: Session = Depends(get_db)):
    """Réinitialise la base de données"""
    try:
        order_count = db.query(Order).delete()
        supplier_count = db.query(Supplier).delete()
        
        db.commit()
        
        return {
            "message": "⚠️ Base de données réinitialisée",
            "orders_deleted": order_count,
            "suppliers_deleted": supplier_count
        }
    
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de la réinitialisation: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")