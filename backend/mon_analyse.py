#mon_analyse.py
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler

from backend.models import Order, Supplier

# ---------------------------------------------------------
# 1. FONCTIONS UTILITAIRES
# ---------------------------------------------------------

def calculer_volatilite(serie: pd.Series) -> float:
    """Calcule l'écart-type d'une série de données"""
    if len(serie) < 2:
        return 0.0
    return float(serie.std())

def detecter_tendance(serie: pd.Series, seuil: float = 0.01) -> str:
    """Détecte la tendance : hausse, baisse ou stable"""
    if len(serie) < 2:
        return "stable"
    
    x = np.arange(len(serie))
    y = serie.values
    
    valid_mask = ~np.isnan(y)
    if np.sum(valid_mask) < 2:
        return "stable"
        
    x = x[valid_mask]
    y = y[valid_mask]
    
    coeffs = np.polyfit(x, y, 1)
    pente = coeffs[0]
    
    if pente > seuil:
        return "hausse"
    elif pente < -seuil:
        return "baisse"
    else:
        return "stable"

# ---------------------------------------------------------
# 2. CHARGEMENT DES DONNÉES
# ---------------------------------------------------------

def charger_donnees(db: Session) -> pd.DataFrame:
    """Charge les données depuis PostgreSQL"""
    try:
        query = db.query(
            Order.date_promised,
            Order.date_delivered,
            Order.defects,
            Supplier.name.label("supplier")
        ).join(Supplier, Order.supplier_id == Supplier.id).statement
        
        df = pd.read_sql(query, db.bind)

        if df.empty:
            return pd.DataFrame(columns=["supplier", "date_promised", "date_delivered", "defects", "delay"])

        df["date_promised"] = pd.to_datetime(df["date_promised"], errors='coerce').dt.tz_localize(None)
        df["date_delivered"] = pd.to_datetime(df["date_delivered"], errors='coerce').dt.tz_localize(None)

        df["delay"] = (df["date_delivered"] - df["date_promised"]).dt.days
        df["delay"] = df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
        df["defects"] = df["defects"].fillna(0.0)

        df = df.sort_values(["supplier", "date_promised"]).reset_index(drop=True)

        return df

    except Exception as e:
        print(f"❌ Erreur critique lors du chargement des données : {e}")
        return pd.DataFrame(columns=["supplier", "date_promised", "date_delivered", "defects", "delay"])

# ---------------------------------------------------------
# 3. KPIs GLOBAUX
# ---------------------------------------------------------

def calculer_kpis_globaux(df: pd.DataFrame) -> Dict[str, Any]:
    """Calcule les indicateurs de performance globaux"""
    
    total_commandes = len(df)
    if total_commandes == 0:
        return {
            "taux_retard": 0, "taux_defaut": 0, "retard_moyen": 0,
            "nb_fournisseurs": 0, "nb_commandes": 0, 
            "defaut_max": 0, "retard_max": 0, 
            "commandes_parfaites": 0, "taux_conformite": 0
        }
        
    commandes_en_retard = len(df[df["delay"] > 0])
    commandes_parfaites = len(df[(df["delay"] == 0) & (df["defects"] == 0)])
    
    df_retards = df[df["delay"] > 0]
    retard_moyen_si_retard = df_retards["delay"].mean() if not df_retards.empty else 0

    kpis = {
        "taux_retard": round((commandes_en_retard / total_commandes * 100), 2),
        "taux_defaut": round(df["defects"].mean() * 100, 2),
        "retard_moyen": round(retard_moyen_si_retard, 2),
        "nb_fournisseurs": df["supplier"].nunique(),
        "nb_commandes": total_commandes,
        "defaut_max": round(df["defects"].max() * 100, 2),
        "retard_max": int(df["delay"].max()) if not df["delay"].empty else 0,
        "commandes_parfaites": commandes_parfaites,
        "taux_conformite": round((commandes_parfaites / total_commandes * 100), 2)
    }
    
    return kpis

# ---------------------------------------------------------
# 4. RISQUES FOURNISSEURS (SCORING)
# ---------------------------------------------------------

def calculer_risques_fournisseurs(df: pd.DataFrame) -> List[Dict]:
    """Calcule un score de risque composite pour chaque fournisseur"""
    fournisseurs = []
    
    if df.empty:
        return []
        
    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier]
        
        retard_moyen = df_s["delay"].mean()
        taux_defaut = df_s["defects"].mean()
        
        nb_retards = len(df_s[df_s["delay"] > 0])
        taux_retard_pct = (nb_retards / len(df_s)) * 100
        
        volatilite_defauts = calculer_volatilite(df_s["defects"])
        volatilite_retards = calculer_volatilite(df_s["delay"])
        
        tendance_defauts = detecter_tendance(df_s["defects"])
        tendance_retards = detecter_tendance(df_s["delay"])
        
        score_retard = min(retard_moyen * 8, 50)
        score_defaut = min(taux_defaut * 800, 50)
        score_total = score_retard + score_defaut
        
        if tendance_defauts == "hausse": score_total += 15
        if tendance_retards == "hausse": score_total += 10
        if tendance_defauts == "baisse": score_total -= 5
        if tendance_retards == "baisse": score_total -= 5
        
        score_total = max(0, min(score_total, 100))
        
        if score_total < 25:
            niveau_risque, status = "Faible", "good"
        elif score_total < 55:
            niveau_risque, status = "Modéré", "warning"
        else:
            niveau_risque, status = "Élevé", "alert"
        
        derniere_date = df_s["date_delivered"].max()
        if pd.isna(derniere_date):
            derniere_date_alt = df_s["date_promised"].max()
            derniere_date_str = derniere_date_alt.strftime("%Y-%m-%d") if pd.notna(derniere_date_alt) else "N/A"
            jours_depuis = -1
        else:
            derniere_date_str = derniere_date.strftime("%Y-%m-%d")
            jours_depuis = (datetime.now() - derniere_date).days

        fournisseurs.append({
            "supplier": supplier,
            "score_risque": round(score_total, 1),
            "niveau_risque": niveau_risque,
            "status": status,
            "retard_moyen": round(retard_moyen, 1),
            "taux_defaut": round(taux_defaut * 100, 2),
            "taux_retard": round(taux_retard_pct, 1),
            "nb_commandes": len(df_s),
            "volatilite_defauts": round(volatilite_defauts * 100, 2),
            "volatilite_retards": round(volatilite_retards, 1),
            "tendance_defauts": tendance_defauts,
            "tendance_retards": tendance_retards,
            "derniere_commande": derniere_date_str,
            "jours_depuis_derniere": jours_depuis
        })
    
    fournisseurs.sort(key=lambda x: x["score_risque"], reverse=True)
    return fournisseurs

# ---------------------------------------------------------
# 5. ACTIONS RECOMMANDÉES
# ---------------------------------------------------------

def obtenir_actions_recommandees(fournisseurs: List[Dict]) -> List[Dict]:
    """Génère des suggestions d'actions basées sur les scores de risque"""
    actions = []
    
    for f in fournisseurs:
        supplier_name = f["supplier"]
        defaut_pct = f.get("taux_defaut", 0)
        retard_moyen = f.get("retard_moyen", 0)
        tendance_defauts = f.get("tendance_defauts", "stable")
        tendance_retards = f.get("tendance_retards", "stable")
        
        if f["niveau_risque"] == "Élevé":
            actions.append({
                "supplier": supplier_name,
                "action": f"🔴 Audit 8D complet requis",
                "priority": "high",
                "raison": f"Score de risque {f['score_risque']}/100",
                "delai": "48h",
                "impact": "Critique"
            })
            
            if defaut_pct >= 5:
                actions.append({
                    "supplier": supplier_name,
                    "action": "⚙️ Recalibrer le processus",
                    "priority": "high",
                    "raison": f"Défauts critiques ({defaut_pct}%)",
                    "delai": "Immédiat",
                    "impact": "Critique"
                })
            
            if retard_moyen >= 5:
                actions.append({
                    "supplier": supplier_name,
                    "action": "🚚 Revoir la chaîne logistique",
                    "priority": "high",
                    "raison": f"Retards importants ({retard_moyen}j)",
                    "delai": "Immédiat",
                    "impact": "Critique"
                })

        elif f["niveau_risque"] == "Modéré":
            if tendance_retards == "hausse":
                actions.append({
                    "supplier": supplier_name,
                    "action": "🚚 Point logistique hebdomadaire",
                    "priority": "medium",
                    "raison": "Dérive des délais observée",
                    "delai": "Semaine prochaine",
                    "impact": "Moyen"
                })
            
            if tendance_defauts == "hausse":
                actions.append({
                    "supplier": supplier_name,
                    "action": "📚 Former les équipes QC",
                    "priority": "medium",
                    "raison": "Qualité en baisse",
                    "delai": "Dès demain",
                    "impact": "Moyen"
                })

        else:
            if f["jours_depuis_derniere"] > 60:
                actions.append({
                    "supplier": supplier_name,
                    "action": "📞 Appel de courtoisie",
                    "priority": "low",
                    "raison": "Inactif depuis > 2 mois",
                    "delai": "Ce mois-ci",
                    "impact": "Faible"
                })
    
    return actions

# ---------------------------------------------------------
# 6. PRÉDICTIONS AVANCÉES (Moyenne Glissante + Régression Linéaire)
# ---------------------------------------------------------

def calculer_predictions_avancees(df: pd.DataFrame, fenetre: int = 3) -> List[Dict]:
    """
    Calcule prédictions avec 3 méthodes :
    1. Moyenne glissante (simple)
    2. Régression linéaire (tendance)
    3. Exponentielle lissée
    """
    predictions = []
    
    if df.empty:
        return []

    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier].sort_values("date_promised").reset_index(drop=True)
        
        if len(df_s) < 2:
            continue
        
        # ===== MÉTHODE 1 : MOYENNE GLISSANTE =====
        rolling_defects = df_s["defects"].rolling(window=fenetre, min_periods=1).mean()
        rolling_delay = df_s["delay"].rolling(window=fenetre, min_periods=1).mean()
        
        pred_defect_ma = rolling_defects.iloc[-1]
        pred_delay_ma = rolling_delay.iloc[-1]
        
        # ===== MÉTHODE 2 : RÉGRESSION LINÉAIRE =====
        try:
            X = np.arange(len(df_s)).reshape(-1, 1)
            
            # Régression défauts
            model_defects = LinearRegression()
            model_defects.fit(X, df_s["defects"].values)
            pred_defect_lr = max(0, model_defects.predict([[len(df_s)]])[0])
            
            # Régression retards
            model_delay = LinearRegression()
            model_delay.fit(X, df_s["delay"].values)
            pred_delay_lr = max(0, model_delay.predict([[len(df_s)]])[0])
        except:
            pred_defect_lr = pred_defect_ma
            pred_delay_lr = pred_delay_ma
        
        # ===== MÉTHODE 3 : EXPONENTIELLE LISSÉE =====
        alpha = 0.3  # Facteur de lissage
        def exponential_smoothing(series, alpha):
            result = [series.iloc[0]]
            for i in range(1, len(series)):
                result.append(alpha * series.iloc[i] + (1 - alpha) * result[i-1])
            return result[-1]
        
        pred_defect_exp = exponential_smoothing(df_s["defects"], alpha)
        pred_delay_exp = exponential_smoothing(df_s["delay"], alpha)
        
        # Moyenne des 3 prédictions pour confiance
        pred_defect_final = np.mean([pred_defect_ma, pred_defect_lr, pred_defect_exp])
        pred_delay_final = np.mean([pred_delay_ma, pred_delay_lr, pred_delay_exp])
        
        # Déterminer le niveau de confiance
        variance_defects = np.var([pred_defect_ma, pred_defect_lr, pred_defect_exp])
        confiance = "basse" if variance_defects > 0.01 else "haute" if len(df_s) >= fenetre else "moyenne"
        
        predictions.append({
            "supplier": supplier,
            "predicted_defect": round(pred_defect_final * 100, 2),
            "predicted_delay": round(pred_delay_final, 2),
            "method_ma_defect": round(pred_defect_ma * 100, 2),
            "method_ma_delay": round(pred_delay_ma, 2),
            "method_lr_defect": round(pred_defect_lr * 100, 2),
            "method_lr_delay": round(pred_delay_lr, 2),
            "method_exp_defect": round(pred_defect_exp * 100, 2),
            "method_exp_delay": round(pred_delay_exp, 2),
            "confiance": confiance,
            "nb_commandes_historique": len(df_s)
        })
    
    return predictions

# Alias pour compatibilité
def calculer_predictions(df: pd.DataFrame, fenetre: int = 3) -> List[Dict]:
    """Wrapper pour compatibilité avec l'ancienne API"""
    return calculer_predictions_avancees(df, fenetre)

# ---------------------------------------------------------
# 7. DÉTAIL FOURNISSEUR
# ---------------------------------------------------------

def obtenir_detail_fournisseur(df: pd.DataFrame, supplier_name: str) -> Optional[Dict]:
    """Retourne les données brutes et lissées pour un fournisseur spécifique"""
    
    if supplier_name not in df["supplier"].values:
        return None
    
    df_s = df[df["supplier"] == supplier_name].copy()
    
    df_s["ma_defects"] = df_s["defects"].rolling(window=3, min_periods=1).mean()
    df_s["ma_delay"] = df_s["delay"].rolling(window=3, min_periods=1).mean()
    
    df_s["date_promised_str"] = df_s["date_promised"].dt.strftime("%Y-%m-%d")
    
    df_s["date_delivered_str"] = df_s["date_delivered"].apply(
        lambda x: x.strftime("%Y-%m-%d") if pd.notna(x) else "Non Livré"
    )
    
    return {
        "supplier": supplier_name,
        "nb_commandes": len(df_s),
        "historique": df_s.apply(lambda row: {
            "date_promised": row["date_promised_str"],
            "date_delivered": row["date_delivered_str"],
            "delay": int(row["delay"]),
            "defects": round(row["defects"] * 100, 2),
            "ma_defects": round(row["ma_defects"] * 100, 2),
            "ma_delay": round(row["ma_delay"], 2)
        }, axis=1).tolist()
    }

# ---------------------------------------------------------
# 8. STATISTIQUES TEMPORELLES
# ---------------------------------------------------------

def calculer_stats_periode(df: pd.DataFrame, jours: int = 30) -> Dict:
    """Filtre et calcule les stats sur les X derniers jours"""
    
    if df.empty:
        return {"message": "Aucune donnée disponible"}

    date_limite = datetime.now() - timedelta(days=jours)
    df_periode = df[df["date_promised"] >= date_limite]
    
    if df_periode.empty:
        return {
            "periode": f"{jours} jours",
            "nb_commandes": 0,
            "message": "Aucune commande sur cette période"
        }
    
    return {
        "periode": f"{jours} jours",
        "nb_commandes": len(df_periode),
        "taux_defaut_moyen": round(df_periode["defects"].mean() * 100, 2),
        "retard_moyen": round(df_periode["delay"].mean(), 2),
        "fournisseurs_actifs": int(df_periode["supplier"].nunique())
    }

# ---------------------------------------------------------
# 9. DISTRIBUTION DES RISQUES (pour graphique circulaire)
# ---------------------------------------------------------

def calculer_distribution_risques(fournisseurs: List[Dict]) -> Dict[str, Any]:
    """Calcule la distribution des niveaux de risque"""
    
    risque_faible = len([f for f in fournisseurs if f["niveau_risque"] == "Faible"])
    risque_modere = len([f for f in fournisseurs if f["niveau_risque"] == "Modéré"])
    risque_eleve = len([f for f in fournisseurs if f["niveau_risque"] == "Élevé"])
    
    total = len(fournisseurs) if fournisseurs else 1
    
    return {
        "faible": {
            "count": risque_faible,
            "percentage": round((risque_faible / total) * 100, 1),
            "color": "#10b981"
        },
        "modere": {
            "count": risque_modere,
            "percentage": round((risque_modere / total) * 100, 1),
            "color": "#f59e0b"
        },
        "eleve": {
            "count": risque_eleve,
            "percentage": round((risque_eleve / total) * 100, 1),
            "color": "#ef4444"
        }
    }

# ---------------------------------------------------------
# 10. COMPARAISON MÉTHODES DE PRÉDICTION
# ---------------------------------------------------------

def comparer_methodes_prediction(df: pd.DataFrame, supplier_name: str) -> Optional[Dict]:
    """Compare les 3 méthodes de prédiction pour un fournisseur spécifique"""
    
    if supplier_name not in df["supplier"].values:
        return None
    
    df_s = df[df["supplier"] == supplier_name].sort_values("date_promised").reset_index(drop=True)
    
    if len(df_s) < 2:
        return None
    
    fenetre = min(3, len(df_s))
    X = np.arange(len(df_s)).reshape(-1, 1)
    
    # Moyenne glissante
    ma_def = df_s["defects"].rolling(window=fenetre, min_periods=1).mean().iloc[-1]
    ma_del = df_s["delay"].rolling(window=fenetre, min_periods=1).mean().iloc[-1]
    
    # Régression linéaire
    model_def = LinearRegression().fit(X, df_s["defects"].values)
    model_del = LinearRegression().fit(X, df_s["delay"].values)
    lr_def = max(0, model_def.predict([[len(df_s)]])[0])
    lr_del = max(0, model_del.predict([[len(df_s)]])[0])
    
    # Exponentielle
    alpha = 0.3
    def exp_smooth(series):
        result = [series.iloc[0]]
        for i in range(1, len(series)):
            result.append(alpha * series.iloc[i] + (1 - alpha) * result[i-1])
        return result[-1]
    
    exp_def = exp_smooth(df_s["defects"])
    exp_del = exp_smooth(df_s["delay"])
    
    return {
        "supplier": supplier_name,
        "methodes": {
            "moyenne_glissante": {
                "defect": round(ma_def * 100, 2),
                "delay": round(ma_del, 2)
            },
            "regression_lineaire": {
                "defect": round(lr_def * 100, 2),
                "delay": round(lr_del, 2)
            },
            "exponentielle_lissee": {
                "defect": round(exp_def * 100, 2),
                "delay": round(exp_del, 2)
            }
        },
        "moyenne_finale": {
            "defect": round(np.mean([ma_def, lr_def, exp_def]) * 100, 2),
            "delay": round(np.mean([ma_del, lr_del, exp_del]), 2)
        }
    }