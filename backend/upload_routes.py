# upload_routes.py
"""
CSV Upload API routes for data-agnostic supplier dashboard.
Handles file upload, validation, and data storage in memory.
"""

import io
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from typing import Dict, Any, List, Optional
from datetime import datetime

# Global storage for uploaded data
_uploaded_dataframe: Optional[pd.DataFrame] = None

router = APIRouter(prefix="/api", tags=["upload"])

# Required columns and their expected types
REQUIRED_SCHEMA = {
    "supplier": "string",
    "date_promised": "date (YYYY-MM-DD)",
    "date_delivered": "date (YYYY-MM-DD)", 
    "defects": "float (0.0-1.0)"
}

SAMPLE_CSV = """supplier,date_promised,date_delivered,defects
Supplier A,2024-01-01,2024-01-03,0.02
Supplier A,2024-01-05,2024-01-06,0.01
Supplier B,2024-01-02,2024-01-10,0.05
Supplier B,2024-01-07,2024-01-08,0.03
Supplier C,2024-01-03,2024-01-03,0.00
Supplier C,2024-01-08,2024-01-09,0.01
"""


def get_uploaded_data() -> Optional[pd.DataFrame]:
    """Get the currently uploaded DataFrame"""
    global _uploaded_dataframe
    return _uploaded_dataframe


def set_uploaded_data(df: Optional[pd.DataFrame]) -> None:
    """Set the uploaded DataFrame"""
    global _uploaded_dataframe
    _uploaded_dataframe = df


def validate_csv_schema(df: pd.DataFrame) -> List[str]:
    """
    Validate that the DataFrame has the required columns.
    Returns list of error messages (empty if valid).
    """
    errors = []
    required_columns = ["supplier", "date_promised", "date_delivered", "defects"]
    
    # Check for missing columns
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        errors.append(f"Colonnes manquantes: {', '.join(missing)}")
        return errors
    
    # Validate date columns
    for date_col in ["date_promised", "date_delivered"]:
        try:
            pd.to_datetime(df[date_col], errors='raise')
        except Exception:
            errors.append(f"Colonne '{date_col}' contient des dates invalides. Format attendu: YYYY-MM-DD")
    
    # Validate defects column
    try:
        defects = pd.to_numeric(df["defects"], errors='raise')
        if (defects < 0).any() or (defects > 1).any():
            errors.append("Colonne 'defects' doit contenir des valeurs entre 0.0 et 1.0")
    except Exception:
        errors.append("Colonne 'defects' doit contenir des nombres décimaux")
    
    # Check for empty supplier names
    if df["supplier"].isna().any() or (df["supplier"].astype(str).str.strip() == "").any():
        errors.append("Colonne 'supplier' contient des valeurs vides")
    
    return errors


def process_uploaded_csv(df: pd.DataFrame) -> pd.DataFrame:
    """
    Process and clean the uploaded CSV data.
    Returns a DataFrame ready for analysis.
    """
    # Convert dates
    df["date_promised"] = pd.to_datetime(df["date_promised"], errors='coerce').dt.tz_localize(None)
    df["date_delivered"] = pd.to_datetime(df["date_delivered"], errors='coerce').dt.tz_localize(None)
    
    # Ensure defects is float
    df["defects"] = pd.to_numeric(df["defects"], errors='coerce').fillna(0.0)
    
    # Calculate delay (delivery - promised, in days, minimum 0)
    df["delay"] = (df["date_delivered"] - df["date_promised"]).dt.days
    df["delay"] = df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
    
    # Clean supplier names
    df["supplier"] = df["supplier"].astype(str).str.strip()
    
    # Sort by supplier and date
    df = df.sort_values(["supplier", "date_promised"]).reset_index(drop=True)
    
    return df


@router.post("/upload", response_model=Dict[str, Any])
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file with supplier delivery data.
    
    Required columns:
    - supplier: Supplier name
    - date_promised: Expected delivery date (YYYY-MM-DD)
    - date_delivered: Actual delivery date (YYYY-MM-DD)  
    - defects: Defect rate (0.0 to 1.0)
    """
    # Check file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=400,
            detail="Format de fichier invalide. Veuillez uploader un fichier CSV."
        )
    
    try:
        # Read CSV content
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="Le fichier CSV est vide.")
        
        # Validate schema
        errors = validate_csv_schema(df)
        if errors:
            raise HTTPException(
                status_code=400,
                detail={"message": "Erreurs de validation", "errors": errors}
            )
        
        # Process and store data
        processed_df = process_uploaded_csv(df)
        set_uploaded_data(processed_df)
        
        # Return summary
        return {
            "success": True,
            "message": "Données importées avec succès",
            "summary": {
                "total_rows": len(processed_df),
                "suppliers": processed_df["supplier"].nunique(),
                "date_range": {
                    "start": processed_df["date_promised"].min().strftime("%Y-%m-%d"),
                    "end": processed_df["date_promised"].max().strftime("%Y-%m-%d")
                },
                "supplier_list": processed_df["supplier"].unique().tolist()
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors du traitement du fichier: {str(e)}"
        )


@router.get("/data-status", response_model=Dict[str, Any])
async def get_data_status():
    """Check if data has been uploaded and get summary"""
    df = get_uploaded_data()
    
    if df is None or df.empty:
        return {
            "has_data": False,
            "message": "Aucune donnée importée. Veuillez uploader un fichier CSV."
        }
    
    return {
        "has_data": True,
        "summary": {
            "total_rows": len(df),
            "suppliers": df["supplier"].nunique(),
            "date_range": {
                "start": df["date_promised"].min().strftime("%Y-%m-%d"),
                "end": df["date_promised"].max().strftime("%Y-%m-%d")
            }
        }
    }


@router.delete("/data", response_model=Dict[str, str])
async def clear_data():
    """Clear uploaded data and reset dashboard"""
    set_uploaded_data(None)
    return {"message": "Données effacées. Vous pouvez uploader un nouveau fichier."}


@router.get("/sample-data")
async def get_sample_data():
    """Get sample CSV format and download link"""
    return {
        "schema": REQUIRED_SCHEMA,
        "description": {
            "supplier": "Nom ou identifiant du fournisseur",
            "date_promised": "Date de livraison promise (format: YYYY-MM-DD)",
            "date_delivered": "Date de livraison effective (format: YYYY-MM-DD)",
            "defects": "Taux de défauts (ex: 0.05 = 5%)"
        },
        "sample_preview": SAMPLE_CSV
    }


@router.get("/sample-data/download")
async def download_sample_csv():
    """Download a sample CSV file"""
    return StreamingResponse(
        io.BytesIO(SAMPLE_CSV.encode('utf-8')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_suppliers.csv"}
    )
