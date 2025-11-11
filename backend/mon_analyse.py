import pandas as pd
import numpy as np
from pathlib import Path

# ---------------------------------------------------------
# Chemin vers le fichier de données
# ---------------------------------------------------------
BASE_PATH = Path(__file__).parent
DATA_FILE = BASE_PATH / "donnees.csv"

# ---------------------------------------------------------
# Chargement des données
# ---------------------------------------------------------
def charger_donnees() -> pd.DataFrame:
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Le fichier de données est introuvable : {DATA_FILE}")

    df = pd.read_csv(DATA_FILE)

    if df.empty:
        raise ValueError(f"Le fichier {DATA_FILE} est vide.")

    # Vérification des colonnes attendues
    required_cols = ["supplier", "date_promised", "date_delivered", "defects"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"La colonne attendue '{col}' est manquante dans le fichier de données.")

    # Conversion des dates
    df["date_promised"] = pd.to_datetime(df["date_promised"], errors='coerce')
    df["date_delivered"] = pd.to_datetime(df["date_delivered"], errors='coerce')

    # Calcul du retard en jours
    df["delay"] = (df["date_delivered"] - df["date_promised"]).dt.days

    # Remplacer les valeurs NaN de defects par 0
    df["defects"] = df["defects"].fillna(0)

    return df

# ---------------------------------------------------------
# 1. KPIs globaux
# ---------------------------------------------------------
def calculer_kpis_globaux() -> dict:
    df = charger_donnees()
    taux_retard = (df["delay"] > 0).mean()
    taux_defaut = df["defects"].mean()
    return {
        "taux_retard": round(taux_retard * 100, 2),
        "taux_defaut": round(taux_defaut * 100, 2),
        "nb_fournisseurs": df["supplier"].nunique(),
        "nb_commandes": len(df)
    }

# ---------------------------------------------------------
# 2. Score de risque fournisseurs
# ---------------------------------------------------------
def calculer_risques_fournisseurs() -> list:
    df = charger_donnees()
    grouped = df.groupby("supplier").agg(
        retard_moyen=("delay", lambda x: np.mean(np.maximum(x, 0))),
        taux_defaut=("defects", "mean")
    ).reset_index()

    grouped["score_risque"] = 0.5 * grouped["retard_moyen"] + 0.5 * grouped["taux_defaut"] * 100

    grouped["niveau_risque"] = np.where(
        grouped["score_risque"] > 15, "Élevé",
        np.where(grouped["score_risque"] > 7, "Modéré", "Faible")
    )
    return grouped.to_dict(orient="records")

# ---------------------------------------------------------
# 3. Actions recommandées automatiques
# ---------------------------------------------------------
def obtenir_actions_recommandees() -> list:
    fournisseurs = calculer_risques_fournisseurs()
    recommandations = []
    for f in fournisseurs:
        if f["niveau_risque"] == "Élevé":
            action = "Former les opérateurs + Vérifier l’alignement des machines"
        elif f["niveau_risque"] == "Modéré":
            action = "Recalibrer les postes critiques"
        else:
            action = "Surveillance standard (aucune action urgente)"
        recommandations.append({
            "supplier": f["supplier"],
            "niveau_risque": f["niveau_risque"],
            "action": action
        })
    return recommandations

# ---------------------------------------------------------
# 4. Détail fournisseur (Écran 2)
# ---------------------------------------------------------
def obtenir_detail_fournisseur(supplier_id: int) -> dict:
    df = charger_donnees()
    supplier_list = df["supplier"].unique()
    if supplier_id >= len(supplier_list):
        return None
    supplier_name = supplier_list[supplier_id]
    df_s = df[df["supplier"] == supplier_name]
    return {
        "supplier": supplier_name,
        "historique_retards": df_s[["date_promised", "delay"]].to_dict(orient="records"),
        "historique_defauts": df_s[["date_promised", "defects"]].to_dict(orient="records")
    }

# ---------------------------------------------------------
# 5. Prédictions avec moyenne glissante
# ---------------------------------------------------------
def calculer_predictions(fenetre: int = 3) -> list:
    df = charger_donnees()
    predictions = []

    for supplier in df['supplier'].unique():
        df_s = df[df['supplier'] == supplier].sort_values('date_promised')

        # Moyenne glissante sur défauts et retard
        df_s['pred_defects'] = df_s['defects'].rolling(window=fenetre, min_periods=1).mean()
        df_s['pred_delay'] = df_s['delay'].rolling(window=fenetre, min_periods=1).mean()

        predictions.append({
            'supplier': supplier,
            'predicted_defect': round(df_s['pred_defects'].iloc[-1] * 100, 2),
            'predicted_delay': round(df_s['pred_delay'].iloc[-1], 2)
        })
    return predictions
