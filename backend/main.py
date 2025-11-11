from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List

# Importation des fonctions de votre logique métier
from backend.mon_analyse import (
    calculer_kpis_globaux,
    calculer_risques_fournisseurs,
    obtenir_actions_recommandees
)

app = FastAPI(
    title="API Fournisseurs - Analyse Prédictive",
    version="1.0.0",
    description="Backend servant les données de retard et de défauts pour le dashboard Next.js."
)

# -------------------------------------------------------------
# 1. Configuration CORS
# -------------------------------------------------------------

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

# -------------------------------------------------------------
# 2. ENDPOINT GLOBAL (Écran 1: Synthèse + Fournisseurs)
# -------------------------------------------------------------

@app.get("/api/dashboard/data", response_model=Dict[str, Any])
async def get_dashboard_data():
    try:
        kpis_globaux = calculer_kpis_globaux()
        suppliers_data = calculer_risques_fournisseurs()
        actions_data = obtenir_actions_recommandees()

        return {
            "kpis_globaux": kpis_globaux,
            "suppliers": suppliers_data,
            "actions": actions_data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du calcul des données: {str(e)}")


# -------------------------------------------------------------
# 3. ENDPOINT DÉTAIL FOURNISSEUR (Écran 2)
# -------------------------------------------------------------

@app.get("/api/fournisseur/{supplier_id}", response_model=Dict[str, Any])
async def get_supplier_detail(supplier_id: int):
    from backend.mon_analyse import obtenir_detail_fournisseur

    detail_data = obtenir_detail_fournisseur(supplier_id)

    if not detail_data:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")

    return detail_data
from backend.mon_analyse import calculer_predictions

@app.get("/api/predictions", response_model=Dict[str, Any])
async def get_predictions():
    try:
        preds = calculer_predictions()
        return {"predictions": preds}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du calcul des prédictions: {str(e)}")
@app.get("/api/predictions")
async def get_predictions():
    from backend.mon_analyse import calculer_predictions
    return {"predictions": calculer_predictions()}
