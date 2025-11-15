import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime, timedelta

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------
BASE_PATH = Path(__file__).parent
DATA_FILE = BASE_PATH / "donnees.csv"

# ---------------------------------------------------------
# Fonctions utilitaires
# ---------------------------------------------------------

def calculer_volatilite(serie: pd.Series) -> float:
    """Calcule l'écart-type d'une série"""
    if len(serie) < 2:
        return 0.0
    return float(serie.std())

def detecter_tendance(serie: pd.Series, seuil: float = 0.01) -> str:
    """Détecte la tendance : hausse, baisse ou stable"""
    if len(serie) < 2:
        return "stable"
    
    x = np.arange(len(serie))
    y = serie.values
    
    # Régression linéaire simple
    coeffs = np.polyfit(x, y, 1)
    pente = coeffs[0]
    
    if pente > seuil:
        return "hausse"
    elif pente < -seuil:
        return "baisse"
    else:
        return "stable"

def get_emoji_tendance(tendance: str) -> str:
    """Retourne un emoji selon la tendance"""
    if tendance == "hausse":
        return "📈"
    elif tendance == "baisse":
        return "📉"
    else:
        return "➡️"

# ---------------------------------------------------------
# Chargement des données
# ---------------------------------------------------------

def charger_donnees() -> pd.DataFrame:
    """Charge et nettoie le CSV"""
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Fichier introuvable : {DATA_FILE}")

    df = pd.read_csv(DATA_FILE)

    if df.empty:
        raise ValueError(f"Le fichier {DATA_FILE} est vide")

    # Vérification des colonnes
    required_cols = ["supplier", "date_promised", "date_delivered", "defects"]
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise ValueError(f"Colonnes manquantes : {missing_cols}")

    # Conversion des dates
    df["date_promised"] = pd.to_datetime(df["date_promised"], errors='coerce')
    df["date_delivered"] = pd.to_datetime(df["date_delivered"], errors='coerce')

    # Calcul du retard
    df["delay"] = (df["date_delivered"] - df["date_promised"]).dt.days

    # Remplacer NaN par 0
    df["defects"] = df["defects"].fillna(0)

    # Trier par fournisseur et date
    df = df.sort_values(["supplier", "date_promised"]).reset_index(drop=True)

    return df

# ---------------------------------------------------------
# 1. KPIs Globaux
# ---------------------------------------------------------

def calculer_kpis_globaux() -> Dict:
    """Calcule les indicateurs globaux"""
    df = charger_donnees()
    
    total_commandes = len(df)
    commandes_en_retard = len(df[df["delay"] > 0])
    
    kpis = {
        "taux_retard": round((commandes_en_retard / total_commandes * 100) if total_commandes > 0 else 0, 2),
        "taux_defaut": round(df["defects"].mean() * 100, 2),
        "retard_moyen": round(df[df["delay"] > 0]["delay"].mean(), 2) if commandes_en_retard > 0 else 0,
        "nb_fournisseurs": df["supplier"].nunique(),
        "nb_commandes": total_commandes,
        "defaut_max": round(df["defects"].max() * 100, 2),
        "retard_max": int(df["delay"].max()),
        "commandes_parfaites": len(df[(df["delay"] == 0) & (df["defects"] == 0)]),
        "taux_conformite": round((len(df[(df["delay"] == 0) & (df["defects"] == 0)]) / total_commandes * 100), 2)
    }
    
    return kpis

# ---------------------------------------------------------
# 2. Risques Fournisseurs (avec tendances)
# ---------------------------------------------------------

def calculer_risques_fournisseurs() -> List[Dict]:
    """Calcule le score de risque par fournisseur avec analyse avancée"""
    df = charger_donnees()
    fournisseurs = []
    
    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier]
        
        # Métriques de base
        retard_moyen = df_s["delay"].mean()
        taux_defaut = df_s["defects"].mean()
        commandes_en_retard = len(df_s[df_s["delay"] > 0])
        taux_retard = (commandes_en_retard / len(df_s)) * 100
        
        # Volatilité
        volatilite_defauts = calculer_volatilite(df_s["defects"])
        volatilite_retards = calculer_volatilite(df_s["delay"])
        
        # Tendances
        tendance_defauts = detecter_tendance(df_s["defects"])
        tendance_retards = detecter_tendance(df_s["delay"])
        
        # Score de risque (0-100)
        score_retard = min(retard_moyen * 8, 50)
        score_defaut = min(taux_defaut * 800, 50)
        score_total = score_retard + score_defaut
        
        # Pénalités pour tendances négatives
        if tendance_defauts == "hausse":
            score_total += 15
        if tendance_retards == "hausse":
            score_total += 10
        
        # Bonus pour tendances positives
        if tendance_defauts == "baisse":
            score_total -= 5
        if tendance_retards == "baisse":
            score_total -= 5
        
        score_total = max(0, min(score_total, 100))
        
        # Classification
        if score_total < 25:
            niveau_risque = "Faible"
            status = "good"
        elif score_total < 55:
            niveau_risque = "Modéré"
            status = "warning"
        else:
            niveau_risque = "Élevé"
            status = "alert"
        
        # Dernière commande
        derniere_date = df_s["date_delivered"].max()
        jours_depuis = (datetime.now() - derniere_date).days
        
        fournisseurs.append({
            "supplier": supplier,
            "score_risque": round(score_total, 1),
            "niveau_risque": niveau_risque,
            "status": status,
            "retard_moyen": round(retard_moyen, 1),
            "taux_defaut": round(taux_defaut * 100, 2),
            "taux_retard": round(taux_retard, 1),
            "nb_commandes": len(df_s),
            "volatilite_defauts": round(volatilite_defauts * 100, 2),
            "volatilite_retards": round(volatilite_retards, 1),
            "tendance_defauts": tendance_defauts,
            "tendance_retards": tendance_retards,
            "derniere_commande": derniere_date.strftime("%Y-%m-%d"),
            "jours_depuis_derniere": jours_depuis
        })
    
    # Tri par score décroissant
    fournisseurs.sort(key=lambda x: x["score_risque"], reverse=True)
    
    return fournisseurs

# ---------------------------------------------------------
# 3. Actions Recommandées
# ---------------------------------------------------------

def obtenir_actions_recommandees() -> List[Dict]:
    """Génère des actions basées sur les risques"""
    fournisseurs = calculer_risques_fournisseurs()
    actions = []
    
    for f in fournisseurs:
        action_list = []
        
        # Actions selon niveau de risque
        if f["niveau_risque"] == "Élevé":
            if f["tendance_defauts"] == "hausse":
                action_list.append({
                    "supplier": f["supplier"],
                    "action": f"🔴 URGENT : Recalibrer immédiatement les postes de {f['supplier']}",
                    "priority": "high",
                    "raison": f"Défauts en hausse ({f['taux_defaut']}%)",
                    "delai": "24-48h",
                    "impact": "Critique"
                })
            
            if f["tendance_retards"] == "hausse":
                action_list.append({
                    "supplier": f["supplier"],
                    "action": f"🔴 Audit logistique urgent pour {f['supplier']}",
                    "priority": "high",
                    "raison": f"Retards croissants (moy: {f['retard_moyen']}j)",
                    "delai": "1 semaine",
                    "impact": "Élevé"
                })
            
            if f["volatilite_defauts"] > 3:
                action_list.append({
                    "supplier": f["supplier"],
                    "action": f"⚠️ Stabiliser processus de {f['supplier']}",
                    "priority": "high",
                    "raison": "Forte volatilité des défauts",
                    "delai": "2 semaines",
                    "impact": "Élevé"
                })
        
        elif f["niveau_risque"] == "Modéré":
            action_list.append({
                "supplier": f["supplier"],
                "action": f"🟡 Former opérateurs de {f['supplier']}",
                "priority": "medium",
                "raison": f"Risque modéré (score: {f['score_risque']})",
                "delai": "1 mois",
                "impact": "Moyen"
            })
            
            if f["taux_retard"] > 30:
                action_list.append({
                    "supplier": f["supplier"],
                    "action": f"📋 Réviser délais avec {f['supplier']}",
                    "priority": "medium",
                    "raison": f"Taux retard élevé ({f['taux_retard']}%)",
                    "delai": "2 semaines",
                    "impact": "Moyen"
                })
        
        else:  # Faible
            action_list.append({
                "supplier": f["supplier"],
                "action": f"✅ Surveillance standard pour {f['supplier']}",
                "priority": "low",
                "raison": "Performance acceptable",
                "delai": "Continue",
                "impact": "Faible"
            })
        
        actions.extend(action_list)
    
    return actions

# ---------------------------------------------------------
# 4. Détail Fournisseur
# ---------------------------------------------------------

def obtenir_detail_fournisseur(supplier_name: str) -> Optional[Dict]:
    """Retourne l'historique détaillé d'un fournisseur"""
    df = charger_donnees()
    
    if supplier_name not in df["supplier"].values:
        return None
    
    df_s = df[df["supplier"] == supplier_name].copy()
    
    # Calculer les moyennes glissantes
    df_s["ma_defects"] = df_s["defects"].rolling(window=3, min_periods=1).mean()
    df_s["ma_delay"] = df_s["delay"].rolling(window=3, min_periods=1).mean()
    
    return {
        "supplier": supplier_name,
        "nb_commandes": len(df_s),
        "historique": df_s[[
            "date_promised", 
            "date_delivered", 
            "delay", 
            "defects",
            "ma_defects",
            "ma_delay"
        ]].to_dict(orient="records")
    }

# ---------------------------------------------------------
# 5. Prédictions (Moyenne Glissante)
# ---------------------------------------------------------

def calculer_predictions(fenetre: int = 3) -> List[Dict]:
    """Calcule les prédictions par moyenne glissante"""
    df = charger_donnees()
    predictions = []
    
    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier].sort_values("date_promised")
        
        # Moyenne glissante
        df_s["pred_defects"] = df_s["defects"].rolling(window=fenetre, min_periods=1).mean()
        df_s["pred_delay"] = df_s["delay"].rolling(window=fenetre, min_periods=1).mean()
        
        # Dernière prédiction
        last_pred_defect = df_s["pred_defects"].iloc[-1]
        last_pred_delay = df_s["pred_delay"].iloc[-1]
        
        # Tendance
        tendance_def = detecter_tendance(df_s["defects"])
        tendance_del = detecter_tendance(df_s["delay"])
        
        predictions.append({
            "supplier": supplier,
            "predicted_defect": round(last_pred_defect * 100, 2),
            "predicted_delay": round(last_pred_delay, 2),
            "tendance_defects": tendance_def,
            "tendance_delays": tendance_del,
            "confiance": "moyenne" if len(df_s) >= fenetre else "faible"
        })
    
    return predictions

# ---------------------------------------------------------
# 6. Statistiques par période
# ---------------------------------------------------------

def calculer_stats_periode(jours: int = 30) -> Dict:
    """Calcule les stats sur une période donnée"""
    df = charger_donnees()
    
    date_limite = datetime.now() - timedelta(days=jours)
    df_periode = df[df["date_promised"] >= date_limite]
    
    if len(df_periode) == 0:
        return {
            "periode": f"{jours} jours",
            "nb_commandes": 0,
            "message": "Aucune donnée sur cette période"
        }
    
    return {
        "periode": f"{jours} jours",
        "nb_commandes": len(df_periode),
        "taux_defaut_moyen": round(df_periode["defects"].mean() * 100, 2),
        "retard_moyen": round(df_periode["delay"].mean(), 2),
        "fournisseurs_actifs": df_periode["supplier"].nunique()
    }