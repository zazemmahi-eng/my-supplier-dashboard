import sys
import os
from pathlib import Path

# Configuration du chemin AVANT d'importer les modules backend
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select

# Import explicite des modèles définis dans backend/models.py
from backend.models import Order, Supplier

# ---------------------------------------------------------
# Fonctions Utilitaires (Calculs Statistiques)
# ---------------------------------------------------------
def calculer_volatilite(serie: pd.Series) -> float:
    """Calcule l'écart-type d'une série de données"""
    if len(serie) < 2:
        return 0.0
    return float(serie.std())

# ... reste du code

def detecter_tendance(serie: pd.Series, seuil: float = 0.01) -> str:
    """Détecte la tendance : hausse, baisse ou stable"""
    if len(serie) < 2:
        return "stable"
    
    # Création d'un index numérique pour la régression
    x = np.arange(len(serie))
    y = serie.values
    
    # Gestion des cas où les données seraient manquantes dans la série
    valid_mask = ~np.isnan(y)
    if np.sum(valid_mask) < 2:
        return "stable"
        
    x = x[valid_mask]
    y = y[valid_mask]
    
    # Régression linéaire simple (pente)
    coeffs = np.polyfit(x, y, 1)
    pente = coeffs[0]
    
    if pente > seuil:
        return "hausse"
    elif pente < -seuil:
        return "baisse"
    else:
        return "stable"

# ---------------------------------------------------------
# Chargement des données (Coeur du système)
# ---------------------------------------------------------

def charger_donnees(db: Session) -> pd.DataFrame:
    """
    Charge les données depuis PostgreSQL via SQLAlchemy et les convertit en DataFrame Pandas.
    Effectue le nettoyage et les calculs préliminaires (délais, types).
    """
    try:
        # Construction de la requête SQL via SQLAlchemy ORM
        # On sélectionne les champs de la commande et le nom du fournisseur associé
        query = db.query(
            Order.date_promised,
            Order.date_delivered,
            Order.defects,
            Supplier.name.label("supplier")
        ).join(Supplier, Order.supplier_id == Supplier.id).statement
        
        # Exécution avec Pandas
        # Note: db.bind récupère l'engine connecté
        df = pd.read_sql(query, db.bind)

        # Si la base est vide, retourner une structure vide mais typée
        if df.empty:
            return pd.DataFrame(columns=["supplier", "date_promised", "date_delivered", "defects", "delay"])

        # --- Nettoyage et Typage ---

        # 1. Conversion des dates en format datetime sans timezone (pour calculs faciles)
        # Le paramètre 'coerce' gère les erreurs silencieusement (NaT)
        df["date_promised"] = pd.to_datetime(df["date_promised"], errors='coerce').dt.tz_localize(None)
        df["date_delivered"] = pd.to_datetime(df["date_delivered"], errors='coerce').dt.tz_localize(None)

        # 2. Calcul du retard (en jours)
        # On soustrait la date promise à la date livrée
        df["delay"] = (df["date_delivered"] - df["date_promised"]).dt.days
        
        # 3. Logique métier : 
        # - Si delay est négatif (livré en avance), on met 0.
        # - Si delay est NaN (pas encore livré), on met 0 (pour ne pas fausser la moyenne des retards avérés).
        df["delay"] = df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)

        # 4. Gestion des défauts (Remplacer NULL par 0.0)
        df["defects"] = df["defects"].fillna(0.0)

        # 5. Tri par fournisseur et date promise
        df = df.sort_values(["supplier", "date_promised"]).reset_index(drop=True)

        return df

    except Exception as e:
        print(f"❌ Erreur critique lors du chargement des données : {e}")
        # Retourner un DF vide pour éviter de crasher l'API entière
        return pd.DataFrame(columns=["supplier", "date_promised", "date_delivered", "defects", "delay"])

# ---------------------------------------------------------
# 1. KPIs Globaux
# ---------------------------------------------------------

def calculer_kpis_globaux(df: pd.DataFrame) -> Dict[str, Any]:
    """Calcule les indicateurs de performance globaux pour le dashboard"""
    
    total_commandes = len(df)
    if total_commandes == 0:
        return {
            "taux_retard": 0, "taux_defaut": 0, "retard_moyen": 0,
            "nb_fournisseurs": 0, "nb_commandes": 0, 
            "defaut_max": 0, "retard_max": 0, 
            "commandes_parfaites": 0, "taux_conformite": 0
        }
        
    # Commandes livrées strictement en retard (> 0 jours)
    commandes_en_retard = len(df[df["delay"] > 0])
    
    # Commandes "Parfaites" (À l'heure ET sans défauts)
    # Note: On assume ici que defects == 0 est la perfection
    commandes_parfaites = len(df[(df["delay"] == 0) & (df["defects"] == 0)])
    
    # Calcul du retard moyen UNIQUEMENT sur les commandes en retard
    # (Si on incluait les commandes à l'heure (0), cela diluerait trop le chiffre)
    df_retards = df[df["delay"] > 0]
    retard_moyen_si_retard = df_retards["delay"].mean() if not df_retards.empty else 0

    kpis = {
        "taux_retard": round((commandes_en_retard / total_commandes * 100), 2),
        "taux_defaut": round(df["defects"].mean() * 100, 2), # Défauts moyens globaux
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
# 2. Risques Fournisseurs (Algorithme de Scoring)
# ---------------------------------------------------------

def calculer_risques_fournisseurs(df: pd.DataFrame) -> List[Dict]:
    """Calcule un score de risque composite pour chaque fournisseur"""
    fournisseurs = []
    
    if df.empty:
        return []
        
    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier]
        
        # --- Métriques de base ---
        retard_moyen = df_s["delay"].mean()
        taux_defaut = df_s["defects"].mean()
        
        nb_retards = len(df_s[df_s["delay"] > 0])
        taux_retard_pct = (nb_retards / len(df_s)) * 100
        
        # --- Volatilité & Tendance ---
        volatilite_defauts = calculer_volatilite(df_s["defects"])
        volatilite_retards = calculer_volatilite(df_s["delay"])
        
        tendance_defauts = detecter_tendance(df_s["defects"])
        tendance_retards = detecter_tendance(df_s["delay"])
        
        # --- Algorithme de Scoring (0 à 100) ---
        # Pondération arbitraire : Défauts pèsent lourd (x800 car c'est un %), Retards pèsent moins (x8)
        score_retard = min(retard_moyen * 8, 50) # Max 50 points pour le retard
        score_defaut = min(taux_defaut * 800, 50) # Max 50 points pour les défauts
        score_total = score_retard + score_defaut
        
        # Pénalités de tendance (Si ça empire, on augmente le risque)
        if tendance_defauts == "hausse": score_total += 15
        if tendance_retards == "hausse": score_total += 10
        
        # Bonus d'amélioration (Si ça s'améliore, on baisse le risque)
        if tendance_defauts == "baisse": score_total -= 5
        if tendance_retards == "baisse": score_total -= 5
        
        # Bornage 0-100
        score_total = max(0, min(score_total, 100))
        
        # Catégorisation
        if score_total < 25:
            niveau_risque, status = "Faible", "good"
        elif score_total < 55:
            niveau_risque, status = "Modéré", "warning"
        else:
            niveau_risque, status = "Élevé", "alert"
        
        # Dernière activité
        derniere_date = df_s["date_delivered"].max()
        if pd.isna(derniere_date):
            # Si aucune date de livraison (ex: que des commandes promises futures ou non livrées)
            # On essaye la date promise
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
    
    # Trier par risque décroissant (les plus risqués en premier)
    fournisseurs.sort(key=lambda x: x["score_risque"], reverse=True)
    return fournisseurs

# ---------------------------------------------------------
# 3. Actions Recommandées (Moteur de Règles)
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
        
        # Contexte pour l'affichage UI
        metrics_resume = f"Défauts {defaut_pct}% / Retard {retard_moyen} j"
        
        if f["niveau_risque"] == "Élevé":
            # Actions Critiques
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
                    "action": "⚙️ Arrêt production / Recalibrage",
                    "priority": "high",
                    "raison": f"Taux de défauts critique ({defaut_pct}%)",
                    "delai": "Immédiat",
                    "impact": "Critique"
                })

        elif f["niveau_risque"] == "Modéré":
            # Actions Préventives
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
                    "action": "🟡 Renforcer contrôle réception",
                    "priority": "medium",
                    "raison": "Qualité en baisse légère",
                    "delai": "Dès demain",
                    "impact": "Moyen"
                })

        else: # Risque Faible
            # Actions de Maintenance
            if f["jours_depuis_derniere"] > 60:
                actions.append({
                    "supplier": supplier_name,
                    "action": "📞 Appel de courtoisie / Relance",
                    "priority": "low",
                    "raison": "Inactif depuis > 2 mois",
                    "delai": "Ce mois-ci",
                    "impact": "Faible"
                })
    
    return actions

# ---------------------------------------------------------
# 4. Détail Fournisseur (Drill-down)
# ---------------------------------------------------------

def obtenir_detail_fournisseur(df: pd.DataFrame, supplier_name: str) -> Optional[Dict]:
    """Retourne les données brutes et lissées pour un fournisseur spécifique"""
    
    if supplier_name not in df["supplier"].values:
        return None
    
    # On travaille sur une copie pour ne pas impacter le DF global
    df_s = df[df["supplier"] == supplier_name].copy()
    
    # Calculer les moyennes glissantes (Rolling Average) pour lisser les courbes
    # Window=3 : moyenne sur les 3 dernières commandes
    df_s["ma_defects"] = df_s["defects"].rolling(window=3, min_periods=1).mean()
    df_s["ma_delay"] = df_s["delay"].rolling(window=3, min_periods=1).mean()
    
    # Formater les dates pour l'API JSON
    df_s["date_promised_str"] = df_s["date_promised"].dt.strftime("%Y-%m-%d")
    
    # Gestion sécurisée de date_delivered qui peut contenir des NaT
    df_s["date_delivered_str"] = df_s["date_delivered"].apply(
        lambda x: x.strftime("%Y-%m-%d") if pd.notna(x) else "Non Livré"
    )
    
    return {
        "supplier": supplier_name,
        "nb_commandes": len(df_s),
        "historique": df_s.apply(lambda row: {
            "date_promised": row["date_promised_str"],
            "date_delivered": row["date_delivered_str"],
            "delay": row["delay"],
            "defects": row["defects"],
            "ma_defects": round(row["ma_defects"], 4), # Arrondi pour propreté JSON
            "ma_delay": round(row["ma_delay"], 2)
        }, axis=1).tolist()
    }

# ---------------------------------------------------------
# 5. Prédictions (Machine Learning basique)
# ---------------------------------------------------------

def calculer_predictions(df: pd.DataFrame, fenetre: int = 3) -> List[Dict]:
    """Extrapole les performances futures basées sur la moyenne glissante récente"""
    predictions = []
    
    if df.empty:
        return []

    for supplier in df["supplier"].unique():
        df_s = df[df["supplier"] == supplier].sort_values("date_promised")
        
        if df_s.empty:
            continue
            
        # Calcul moyenne glissante
        # On utilise min_periods=1 pour avoir une prédiction même avec 1 seule commande
        rolling_defects = df_s["defects"].rolling(window=fenetre, min_periods=1).mean()
        rolling_delay = df_s["delay"].rolling(window=fenetre, min_periods=1).mean()
        
        # La prédiction est la dernière valeur de la moyenne glissante
        last_pred_defect = rolling_defects.iloc[-1]
        last_pred_delay = rolling_delay.iloc[-1]
        
        predictions.append({
            "supplier": supplier,
            "predicted_defect": round(last_pred_defect * 100, 2), # En pourcentage
            "predicted_delay": round(last_pred_delay, 2),         # En jours
            "confiance": "haute" if len(df_s) >= fenetre else "basse"
        })
    
    return predictions

# ---------------------------------------------------------
# 6. Statistiques Temporelles
# ---------------------------------------------------------

def calculer_stats_periode(df: pd.DataFrame, jours: int = 30) -> Dict:
    """Filtre et calcule les stats sur les X derniers jours"""
    
    if df.empty:
        return {"message": "Aucune donnée disponible"}

    date_limite = datetime.now() - timedelta(days=jours)
    
    # Filtrage
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