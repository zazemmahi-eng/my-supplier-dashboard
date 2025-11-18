import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime, timedelta

# NOUVEAUX IMPORTS pour la base de données
from sqlalchemy.orm import Session
from . import models # Importe vos modèles SQLAlchemy

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------
# SUPPRIMÉ : Les chemins vers le CSV ne sont plus nécessaires
# BASE_PATH = Path(__file__).parent
# DATA_FILE = BASE_PATH / "donnees.csv"

# ---------------------------------------------------------
# Fonctions utilitaires
# ---------------------------------------------------------
# (Ces fonctions n'ont pas besoin de changer)

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
# Chargement des données (MODIFIÉ)
# ---------------------------------------------------------

def charger_donnees(db: Session) -> pd.DataFrame:
    """
    Charge et nettoie les données DEPUIS LA BASE DE DONNÉES
    au lieu du CSV.
    """
    # Requête pour joindre les commandes et le nom du fournisseur
    query = db.query(
        models.Order.date_promised,
        models.Order.date_delivered,
        models.Order.defects,
        models.Supplier.name.label("supplier") # Renomme Supplier.name en 'supplier'
    ).join(models.Supplier).statement
    
    # Lire directement la requête SQL dans un DataFrame Pandas
    df = pd.read_sql(query, db.bind)

    if df.empty:
        # Retourne un DataFrame vide avec les bonnes colonnes si la DB est vide
        return pd.DataFrame(columns=["supplier", "date_promised", "date_delivered", "defects", "delay"])

    # --- Le reste de la logique de nettoyage est identique ---

    # Conversion des dates (s'assure qu'elles sont timezone-naive pour le calcul)
    df["date_promised"] = pd.to_datetime(df["date_promised"]).dt.tz_localize(None)
    df["date_delivered"] = pd.to_datetime(df["date_delivered"]).dt.tz_localize(None)

    # Calcul du retard
    df["delay"] = (df["date_delivered"] - df["date_promised"]).dt.days
    
    # Gérer les retards négatifs (livraison en avance) et les NaN
    df["delay"] = df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)

    # Remplacer NaN par 0
    df["defects"] = df["defects"].fillna(0)

    # Trier par fournisseur et date
    df = df.sort_values(["supplier", "date_promised"]).reset_index(drop=True)

    return df

# ---------------------------------------------------------
# 1. KPIs Globaux (MODIFIÉ)
# ---------------------------------------------------------

def calculer_kpis_globaux(df: pd.DataFrame) -> Dict:
    """
    Calcule les indicateurs globaux.
    Modification : Accepte un DataFrame en argument.
    """
    # SUPPRIMÉ : df = charger_donnees()
    
    total_commandes = len(df)
    if total_commandes == 0:
        return {} # Gérer le cas où le DataFrame est vide
        
    commandes_en_retard = len(df[df["delay"] > 0])
    commandes_parfaites = len(df[(df["delay"] == 0) & (df["defects"] == 0)])
    
    kpis = {
        "taux_retard": round((commandes_en_retard / total_commandes * 100), 2),
        "taux_defaut": round(df["defects"].mean() * 100, 2),
        "retard_moyen": round(df[df["delay"] > 0]["delay"].mean(), 2) if commandes_en_retard > 0 else 0,
        "nb_fournisseurs": df["supplier"].nunique(),
        "nb_commandes": total_commandes,
        "defaut_max": round(df["defects"].max() * 100, 2),
        "retard_max": int(df["delay"].max()),
        "commandes_parfaites": commandes_parfaites,
        "taux_conformite": round((commandes_parfaites / total_commandes * 100), 2)
    }
    
    return kpis

# ---------------------------------------------------------
# 2. Risques Fournisseurs (MODIFIÉ)
# ---------------------------------------------------------

def calculer_risques_fournisseurs(df: pd.DataFrame) -> List[Dict]:
    """
    Calcule le score de risque par fournisseur.
    Modification : Accepte un DataFrame en argument.
    """
    # SUPPRIMÉ : df = charger_donnees()
    fournisseurs = []
    
    if df.empty:
        return []
        
    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier]
        
        # ... (logique de calcul de risque identique) ...
        retard_moyen = df_s["delay"].mean()
        taux_defaut = df_s["defects"].mean()
        commandes_en_retard = len(df_s[df_s["delay"] > 0])
        taux_retard = (commandes_en_retard / len(df_s)) * 100
        
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
        # Gérer le cas où il n'y a pas de date de livraison
        if pd.isna(derniere_date):
            derniere_date_str = "N/A"
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
            "taux_retard": round(taux_retard, 1),
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
# 3. Actions Recommandées (MODIFIÉ)
# ---------------------------------------------------------

def obtenir_actions_recommandees(fournisseurs: List[Dict]) -> List[Dict]:
    """
    Génère des actions basées sur la liste des risques.
    Modification : Accepte la liste des fournisseurs en argument.
    """
    # SUPPRIMÉ : fournisseurs = calculer_risques_fournisseurs()
    actions = []
    
    for f in fournisseurs:
        action_list = []
        supplier_name = f["supplier"]
        defaut_pct = f.get("taux_defaut", 0)
        retard_moyen = f.get("retard_moyen", 0)
        retard_pct = f.get("taux_retard", 0)
        tendance_defauts = f.get("tendance_defauts", "stable")
        tendance_retards = f.get("tendance_retards", "stable")
        metrics_resume = f"Défauts {defaut_pct}% / Retard {retard_moyen} j ({retard_pct} % retards)"
        
        if f["niveau_risque"] == "Élevé":
            action_list.append({
                "supplier": supplier_name,
                "action": f"🔴 Audit 8D complet chez {supplier_name}",
                "priority": "high",
                "raison": f"Score {f['score_risque']} avec tendance {tendance_defauts}",
                "delai": "48h",
                "impact": "Critique"
            })
            if defaut_pct >= 5 or tendance_defauts == "hausse":
                action_list.append({
                    "supplier": supplier_name,
                    "action": f"⚙️ Recalibrer les postes qualité pour {supplier_name}",
                    "priority": "high",
                    "raison": f"Défauts actuels {defaut_pct}%",
                    "delai": "72h",
                    "impact": "Élevé"
                })
            if retard_moyen >= 3 or tendance_retards == "hausse":
                action_list.append({
                    "supplier": supplier_name,
                    "action": f"🚚 Mise sous supervision logistique quotidienne",
                    "priority": "high",
                    "raison": f"Retard moyen {retard_moyen} j",
                    "delai": "24h",
                    "impact": "Critique"
                })
        elif f["niveau_risque"] == "Modéré":
            action_list.append({
                "supplier": supplier_name,
                "action": f"🟡 Former les opérateurs de {supplier_name}",
                "priority": "medium",
                "raison": metrics_resume,
                "delai": "1 mois",
                "impact": "Moyen"
            })
            action_list.append({
                "supplier": supplier_name,
                "action": f"🟠 Mettre en place un plan d'amélioration continue",
                "priority": "medium",
                "raison": f"Tendance défauts: {tendance_defauts}",
                "delai": "2 semaines",
                "impact": "Moyen"
            })
        else:  # Faible
            action_list.append({
                "supplier": supplier_name,
                "action": f"✅ Surveillance standard pour {supplier_name}",
                "priority": "low",
                "raison": "Performance conforme aux objectifs",
                "delai": "Continu",
                "impact": "Faible"
            })
            if tendance_defauts == "hausse" or tendance_retards == "hausse":
                action_list.append({
                    "supplier": supplier_name,
                    "action": f"🔍 Préparer un plan préventif (veille tendance {supplier_name})",
                    "priority": "low",
                    "raison": metrics_resume,
                    "delai": "Hebdomadaire",
                    "impact": "Préventif"
                })
        
        actions.extend(action_list)
    
    return actions

# ---------------------------------------------------------
# 4. Détail Fournisseur (MODIFIÉ)
# ---------------------------------------------------------

def obtenir_detail_fournisseur(df: pd.DataFrame, supplier_name: str) -> Optional[Dict]:
    """
    Retourne l'historique détaillé d'un fournisseur.
    Modification : Accepte un DataFrame en argument.
    """
    # SUPPRIMÉ : df = charger_donnees()
    
    if supplier_name not in df["supplier"].values:
        return None
    
    df_s = df[df["supplier"] == supplier_name].copy()
    
    # Calculer les moyennes glissantes
    df_s["ma_defects"] = df_s["defects"].rolling(window=3, min_periods=1).mean()
    df_s["ma_delay"] = df_s["delay"].rolling(window=3, min_periods=1).mean()
    
    # Formater les dates pour le JSON
    df_s['date_promised'] = df_s['date_promised'].dt.strftime('%Y-%m-%d')
    df_s['date_delivered'] = df_s['date_delivered'].dt.strftime('%Y-%m-%d')
    
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
# 5. Prédictions (MODIFIÉ)
# ---------------------------------------------------------

def calculer_predictions(df: pd.DataFrame, fenetre: int = 3) -> List[Dict]:
    """
    Calcule les prédictions par moyenne glissante.
    Modification : Accepte un DataFrame en argument.
    """
    # SUPPRIMÉ : df = charger_donnees()
    predictions = []
    
    if df.empty:
        return []

    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier].sort_values("date_promised")
        
        if df_s.empty:
            continue
            
        # Moyenne glissante
        df_s["pred_defects"] = df_s["defects"].rolling(window=fenetre, min_periods=1).mean()
        df_s["pred_delay"] = df_s["delay"].rolling(window=fenetre, min_periods=1).mean()
        
        last_pred_defect = df_s["pred_defects"].iloc[-1]
        last_pred_delay = df_s["pred_delay"].iloc[-1]
        
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
# 6. Statistiques par période (MODIFIÉ)
# ---------------------------------------------------------

def calculer_stats_periode(df: pd.DataFrame, jours: int = 30) -> Dict:
    """
    Calcule les stats sur une période donnée.
    Modification : Accepte un DataFrame en argument.
    """
    # SUPPRIMÉ : df = charger_donnees()
    
    if df.empty:
        return {"message": "Aucune donnée disponible"}

    # S'assurer que 'date_promised' est bien au format datetime pour la comparaison
    df_copy = df.copy()
    df_copy["date_promised"] = pd.to_datetime(df_copy["date_promised"])
    
    date_limite = datetime.now() - timedelta(days=jours)
    df_periode = df_copy[df_copy["date_promised"] >= date_limite]
    
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