# workspace_routes.py
"""
FastAPI routes for Workspace management.
Handles workspace CRUD, dataset upload with case-specific validation,
model selection, and KPI management.
"""

import io
import os
import uuid
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from backend.database import get_db
from backend.workspace_models import (
    Workspace, WorkspaceDataset, CustomKPI, ModelSelection,
    DataTypeCase, WorkspaceStatus
)
from backend.mon_analyse import (
    calculer_kpis_globaux,
    calculer_risques_fournisseurs,
    obtenir_actions_recommandees,
    calculer_predictions_avancees,
    calculer_distribution_risques,
    comparer_methodes_prediction
)

# Get backend directory for sample files
BACKEND_DIR = Path(__file__).resolve().parent

# ============================================
# ROUTER CONFIGURATION
# ============================================

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

# ============================================
# PYDANTIC SCHEMAS
# ============================================

class WorkspaceCreate(BaseModel):
    """Schema for creating a new workspace"""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    data_type: DataTypeCase = DataTypeCase.CASE_A


class WorkspaceUpdate(BaseModel):
    """Schema for updating workspace"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[WorkspaceStatus] = None


class WorkspaceResponse(BaseModel):
    """Response schema for workspace"""
    id: uuid.UUID
    name: str
    description: Optional[str]
    data_type: str
    status: str
    created_at: datetime
    updated_at: datetime
    has_data: bool = False
    supplier_count: int = 0
    row_count: int = 0

    class Config:
        from_attributes = True


class CustomKPICreate(BaseModel):
    """Schema for creating custom KPI"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    formula_type: str = "average"  # average, sum, percentage, custom
    target_field: str = Field(..., min_length=1)
    threshold_warning: Optional[float] = None
    threshold_critical: Optional[float] = None
    unit: str = "%"
    decimal_places: int = 2


class ModelSelectionUpdate(BaseModel):
    """Schema for updating model selection"""
    selected_model: str = Field(..., pattern="^(moving_average|linear_regression|exponential|combined)$")
    parameters: Optional[Dict[str, Any]] = None


# ============================================
# DATA VALIDATION SCHEMAS PER CASE
# ============================================

# Case A: Delays format (original)
CASE_A_SCHEMA = {
    "required": ["supplier", "date_promised", "date_delivered", "defects"],
    "types": {
        "supplier": "string",
        "date_promised": "date",
        "date_delivered": "date",
        "defects": "float"
    }
}

# Case B: Late Days format
CASE_B_SCHEMA = {
    "required": ["supplier", "order_date", "expected_days", "actual_days", "quality_score"],
    "types": {
        "supplier": "string",
        "order_date": "date",
        "expected_days": "integer",
        "actual_days": "integer",
        "quality_score": "float"
    }
}

# Case C: Mixed format (combines A and B)
CASE_C_SCHEMA = {
    "required": ["supplier", "date_promised", "date_delivered", "defects", "quality_score"],
    "types": {
        "supplier": "string",
        "date_promised": "date",
        "date_delivered": "date",
        "defects": "float",
        "quality_score": "float"
    }
}


# ============================================
# HELPER FUNCTIONS
# ============================================

def get_schema_for_case(data_type: DataTypeCase) -> Dict:
    """Returns the validation schema for a given data type case"""
    schemas = {
        DataTypeCase.CASE_A: CASE_A_SCHEMA,
        DataTypeCase.CASE_B: CASE_B_SCHEMA,
        DataTypeCase.CASE_C: CASE_C_SCHEMA
    }
    return schemas.get(data_type, CASE_A_SCHEMA)


def validate_csv_for_case(df: pd.DataFrame, data_type: DataTypeCase) -> List[str]:
    """
    Validates a DataFrame against the schema for a specific data type case.
    Returns list of error messages (empty if valid).
    """
    errors = []
    schema = get_schema_for_case(data_type)
    
    # Check required columns
    missing = [col for col in schema["required"] if col not in df.columns]
    if missing:
        errors.append(f"Colonnes manquantes pour Case {data_type.value}: {', '.join(missing)}")
        return errors
    
    # Validate data types
    for col, expected_type in schema["types"].items():
        if col not in df.columns:
            continue
            
        if expected_type == "date":
            try:
                pd.to_datetime(df[col], errors='raise')
            except Exception:
                errors.append(f"Colonne '{col}' contient des dates invalides. Format attendu: YYYY-MM-DD")
        
        elif expected_type == "float":
            try:
                pd.to_numeric(df[col], errors='raise')
            except Exception:
                errors.append(f"Colonne '{col}' doit contenir des nombres décimaux")
        
        elif expected_type == "integer":
            try:
                pd.to_numeric(df[col], errors='raise')
            except Exception:
                errors.append(f"Colonne '{col}' doit contenir des nombres entiers")
    
    # Check for empty supplier names
    if "supplier" in df.columns:
        if df["supplier"].isna().any() or (df["supplier"].astype(str).str.strip() == "").any():
            errors.append("Colonne 'supplier' contient des valeurs vides")
    
    return errors


def process_csv_for_case(df: pd.DataFrame, data_type: DataTypeCase) -> pd.DataFrame:
    """
    Process and normalize CSV data based on the data type case.
    Transforms data to be compatible with existing ML models WITHOUT modifying them.
    """
    processed_df = df.copy()
    
    if data_type == DataTypeCase.CASE_A:
        # Original delays format - minimal processing
        processed_df["date_promised"] = pd.to_datetime(processed_df["date_promised"]).dt.tz_localize(None)
        processed_df["date_delivered"] = pd.to_datetime(processed_df["date_delivered"]).dt.tz_localize(None)
        processed_df["defects"] = pd.to_numeric(processed_df["defects"], errors='coerce').fillna(0.0)
        processed_df["delay"] = (processed_df["date_delivered"] - processed_df["date_promised"]).dt.days
        processed_df["delay"] = processed_df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
    
    elif data_type == DataTypeCase.CASE_B:
        # Late Days format - transform to match original format
        processed_df["order_date"] = pd.to_datetime(processed_df["order_date"]).dt.tz_localize(None)
        processed_df["date_promised"] = processed_df["order_date"] + pd.to_timedelta(processed_df["expected_days"], unit='D')
        processed_df["date_delivered"] = processed_df["order_date"] + pd.to_timedelta(processed_df["actual_days"], unit='D')
        # Convert quality_score (0-100) to defects (0-1)
        processed_df["defects"] = (100 - processed_df["quality_score"]) / 100.0
        processed_df["delay"] = processed_df["actual_days"] - processed_df["expected_days"]
        processed_df["delay"] = processed_df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
    
    elif data_type == DataTypeCase.CASE_C:
        # Mixed format - use both delay and quality metrics
        processed_df["date_promised"] = pd.to_datetime(processed_df["date_promised"]).dt.tz_localize(None)
        processed_df["date_delivered"] = pd.to_datetime(processed_df["date_delivered"]).dt.tz_localize(None)
        processed_df["defects"] = pd.to_numeric(processed_df["defects"], errors='coerce').fillna(0.0)
        processed_df["quality_score"] = pd.to_numeric(processed_df["quality_score"], errors='coerce').fillna(100.0)
        processed_df["delay"] = (processed_df["date_delivered"] - processed_df["date_promised"]).dt.days
        processed_df["delay"] = processed_df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
        # Combine defects and quality_score for enhanced analysis
        processed_df["combined_quality"] = (processed_df["defects"] + (100 - processed_df["quality_score"]) / 100) / 2
    
    # Clean supplier names
    processed_df["supplier"] = processed_df["supplier"].astype(str).str.strip()
    
    # Sort by supplier and date
    date_col = "date_promised" if "date_promised" in processed_df.columns else "order_date"
    processed_df = processed_df.sort_values(["supplier", date_col]).reset_index(drop=True)
    
    return processed_df


def get_workspace_dataframe(workspace_id: uuid.UUID, db: Session) -> Optional[pd.DataFrame]:
    """
    Retrieves the active dataset for a workspace and returns it as a DataFrame.
    Ensures proper data types for ML model compatibility.
    Computes derived columns if missing (for backward compatibility with old data).
    """
    dataset = db.query(WorkspaceDataset).filter(
        WorkspaceDataset.workspace_id == workspace_id,
        WorkspaceDataset.is_active == True
    ).first()
    
    if not dataset or not dataset.data_json:
        return None
    
    df = pd.DataFrame(dataset.data_json)
    
    # Ensure proper data types for ML model compatibility
    # Convert date columns back to datetime
    for col in ['date_promised', 'date_delivered', 'order_date']:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce')
    
    # Compute delay if missing (backward compatibility)
    if 'delay' not in df.columns:
        if 'date_promised' in df.columns and 'date_delivered' in df.columns:
            df['delay'] = (df['date_delivered'] - df['date_promised']).dt.days
            df['delay'] = df['delay'].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
        elif 'expected_days' in df.columns and 'actual_days' in df.columns:
            df['delay'] = df['actual_days'] - df['expected_days']
            df['delay'] = df['delay'].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
        else:
            df['delay'] = 0  # Default to 0 if we can't compute
    
    # Ensure numeric columns are properly typed
    if 'delay' in df.columns:
        df['delay'] = pd.to_numeric(df['delay'], errors='coerce').fillna(0).astype(int)
    
    if 'defects' in df.columns:
        df['defects'] = pd.to_numeric(df['defects'], errors='coerce').fillna(0.0)
    
    if 'quality_score' in df.columns:
        df['quality_score'] = pd.to_numeric(df['quality_score'], errors='coerce').fillna(100.0)
    
    return df


# ============================================
# WORKSPACE CRUD ENDPOINTS
# ============================================

@router.get("", response_model=List[WorkspaceResponse])
async def list_workspaces(
    status: Optional[WorkspaceStatus] = None,
    db: Session = Depends(get_db)
):
    """
    List all workspaces with their basic info.
    Optionally filter by status.
    """
    query = db.query(Workspace)
    
    if status:
        query = query.filter(Workspace.status == status)
    
    workspaces = query.order_by(Workspace.created_at.desc()).all()
    
    # Enrich with data status
    result = []
    for ws in workspaces:
        active_dataset = db.query(WorkspaceDataset).filter(
            WorkspaceDataset.workspace_id == ws.id,
            WorkspaceDataset.is_active == True
        ).first()
        
        result.append(WorkspaceResponse(
            id=ws.id,
            name=ws.name,
            description=ws.description,
            data_type=ws.data_type.value,
            status=ws.status.value,
            created_at=ws.created_at,
            updated_at=ws.updated_at,
            has_data=active_dataset is not None,
            supplier_count=len(active_dataset.suppliers) if active_dataset else 0,
            row_count=active_dataset.row_count if active_dataset else 0
        ))
    
    return result


@router.post("", response_model=WorkspaceResponse)
async def create_workspace(
    workspace: WorkspaceCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new workspace with specified name and data type.
    """
    # Check for duplicate name
    existing = db.query(Workspace).filter(Workspace.name == workspace.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Un workspace nommé '{workspace.name}' existe déjà")
    
    new_workspace = Workspace(
        name=workspace.name,
        description=workspace.description,
        data_type=workspace.data_type
    )
    
    db.add(new_workspace)
    db.commit()
    db.refresh(new_workspace)
    
    return WorkspaceResponse(
        id=new_workspace.id,
        name=new_workspace.name,
        description=new_workspace.description,
        data_type=new_workspace.data_type.value,
        status=new_workspace.status.value,
        created_at=new_workspace.created_at,
        updated_at=new_workspace.updated_at,
        has_data=False,
        supplier_count=0,
        row_count=0
    )


@router.get("/{workspace_id}", response_model=Dict[str, Any])
async def get_workspace(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Get detailed workspace information including dataset and KPI status.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    # Get active dataset
    active_dataset = db.query(WorkspaceDataset).filter(
        WorkspaceDataset.workspace_id == workspace_id,
        WorkspaceDataset.is_active == True
    ).first()
    
    # Get custom KPIs
    custom_kpis = db.query(CustomKPI).filter(
        CustomKPI.workspace_id == workspace_id,
        CustomKPI.is_enabled == True
    ).all()
    
    # Get model selection
    model_selection = db.query(ModelSelection).filter(
        ModelSelection.workspace_id == workspace_id
    ).first()
    
    return {
        "workspace": {
            "id": str(workspace.id),
            "name": workspace.name,
            "description": workspace.description,
            "data_type": workspace.data_type.value,
            "status": workspace.status.value,
            "created_at": workspace.created_at.isoformat(),
            "updated_at": workspace.updated_at.isoformat()
        },
        "dataset": {
            "has_data": active_dataset is not None,
            "filename": active_dataset.filename if active_dataset else None,
            "row_count": active_dataset.row_count if active_dataset else 0,
            "suppliers": active_dataset.suppliers if active_dataset else [],
            "date_range": {
                "start": active_dataset.date_start.isoformat() if active_dataset and active_dataset.date_start else None,
                "end": active_dataset.date_end.isoformat() if active_dataset and active_dataset.date_end else None
            } if active_dataset else None,
            "uploaded_at": active_dataset.uploaded_at.isoformat() if active_dataset else None
        },
        "custom_kpis": [
            {
                "id": str(kpi.id),
                "name": kpi.name,
                "formula_type": kpi.formula_type,
                "target_field": kpi.target_field,
                "unit": kpi.unit
            }
            for kpi in custom_kpis
        ],
        "model_selection": {
            "selected_model": model_selection.selected_model if model_selection else "combined",
            "parameters": model_selection.parameters if model_selection else {},
            "last_run_at": model_selection.last_run_at.isoformat() if model_selection and model_selection.last_run_at else None
        },
        "schema": get_schema_for_case(workspace.data_type)
    }


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: uuid.UUID,
    update_data: WorkspaceUpdate,
    db: Session = Depends(get_db)
):
    """
    Update workspace details (name, description, status).
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    if update_data.name:
        # Check for duplicate name
        existing = db.query(Workspace).filter(
            Workspace.name == update_data.name,
            Workspace.id != workspace_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Un workspace nommé '{update_data.name}' existe déjà")
        workspace.name = update_data.name
    
    if update_data.description is not None:
        workspace.description = update_data.description
    
    if update_data.status:
        workspace.status = update_data.status
    
    db.commit()
    db.refresh(workspace)
    
    active_dataset = db.query(WorkspaceDataset).filter(
        WorkspaceDataset.workspace_id == workspace_id,
        WorkspaceDataset.is_active == True
    ).first()
    
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        data_type=workspace.data_type.value,
        status=workspace.status.value,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        has_data=active_dataset is not None,
        supplier_count=len(active_dataset.suppliers) if active_dataset else 0,
        row_count=active_dataset.row_count if active_dataset else 0
    )


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Delete a workspace and all associated data.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    db.delete(workspace)
    db.commit()
    
    return {"message": f"Workspace '{workspace.name}' supprimé avec succès"}


# ============================================
# DATASET UPLOAD ENDPOINTS
# ============================================

@router.post("/{workspace_id}/upload", response_model=Dict[str, Any])
async def upload_dataset(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload and validate a CSV dataset for a specific workspace.
    Validates according to the workspace's data type case (A, B, or C).
    """
    # Get workspace
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    # Check file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Format invalide. Fichier CSV requis.")
    
    try:
        # Read CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="Le fichier CSV est vide.")
        
        # Validate against case-specific schema
        errors = validate_csv_for_case(df, workspace.data_type)
        if errors:
            raise HTTPException(
                status_code=400,
                detail={"message": "Erreurs de validation", "errors": errors}
            )
        
        # Process data according to case
        processed_df = process_csv_for_case(df, workspace.data_type)
        
        # Deactivate previous datasets
        db.query(WorkspaceDataset).filter(
            WorkspaceDataset.workspace_id == workspace_id
        ).update({"is_active": False})
        
        # Get date range
        date_col = "date_promised" if "date_promised" in processed_df.columns else "order_date"
        date_start = processed_df[date_col].min()
        date_end = processed_df[date_col].max()
        
        # Convert Pandas Timestamps to strings for JSON serialization
        df_for_json = processed_df.copy()
        for col in df_for_json.columns:
            if pd.api.types.is_datetime64_any_dtype(df_for_json[col]):
                df_for_json[col] = df_for_json[col].dt.strftime("%Y-%m-%d")
        
        # Convert date_start and date_end to Python datetime
        date_start_py = pd.to_datetime(date_start).to_pydatetime() if pd.notna(date_start) else None
        date_end_py = pd.to_datetime(date_end).to_pydatetime() if pd.notna(date_end) else None
        
        # Create new dataset record
        new_dataset = WorkspaceDataset(
            workspace_id=workspace_id,
            filename=file.filename,
            row_count=len(processed_df),
            column_count=len(processed_df.columns),
            suppliers=processed_df["supplier"].unique().tolist(),
            date_start=date_start_py,
            date_end=date_end_py,
            data_json=df_for_json.to_dict(orient='records'),
            is_active=True
        )
        
        db.add(new_dataset)
        db.commit()
        db.refresh(new_dataset)
        
        return {
            "success": True,
            "message": f"Dataset uploadé avec succès (Case {workspace.data_type.value})",
            "dataset_id": str(new_dataset.id),
            "summary": {
                "filename": file.filename,
                "total_rows": len(processed_df),
                "suppliers": len(new_dataset.suppliers),
                "supplier_list": new_dataset.suppliers,
                "date_range": {
                    "start": date_start_py.strftime("%Y-%m-%d") if date_start_py else None,
                    "end": date_end_py.strftime("%Y-%m-%d") if date_end_py else None
                }
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de traitement: {str(e)}")


@router.get("/{workspace_id}/schema-info")
async def get_schema_info(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Get the expected schema for the workspace's data type.
    Helps users understand what columns are required.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    schema = get_schema_for_case(workspace.data_type)
    
    # Generate sample CSV content
    samples = {
        DataTypeCase.CASE_A: "supplier,date_promised,date_delivered,defects\nSupplier A,2024-01-01,2024-01-03,0.02\nSupplier B,2024-01-05,2024-01-06,0.01",
        DataTypeCase.CASE_B: "supplier,order_date,expected_days,actual_days,quality_score\nSupplier A,2024-01-01,5,7,95\nSupplier B,2024-01-05,3,3,98",
        DataTypeCase.CASE_C: "supplier,date_promised,date_delivered,defects,quality_score\nSupplier A,2024-01-01,2024-01-03,0.02,95\nSupplier B,2024-01-05,2024-01-06,0.01,98"
    }
    
    return {
        "data_type": workspace.data_type.value,
        "schema": schema,
        "sample_csv": samples.get(workspace.data_type, samples[DataTypeCase.CASE_A])
    }


@router.get("/{workspace_id}/sample-download")
async def download_sample_csv(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Download a sample CSV file for the workspace's data type.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    # Map data types to sample files
    sample_files = {
        DataTypeCase.CASE_A: "sample_data_case_a.csv",
        DataTypeCase.CASE_B: "sample_data_case_b.csv",
        DataTypeCase.CASE_C: "sample_data_case_c.csv"
    }
    
    sample_file = BACKEND_DIR / sample_files.get(workspace.data_type, "sample_data_case_a.csv")
    
    if not sample_file.exists():
        raise HTTPException(status_code=404, detail="Fichier exemple non trouvé")
    
    with open(sample_file, 'rb') as f:
        content = f.read()
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={sample_files[workspace.data_type]}"}
    )


# ============================================
# MODEL SELECTION ENDPOINTS
# ============================================

@router.get("/{workspace_id}/models")
async def list_available_models(workspace_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    List all available ML models that can be used for predictions.
    These are the EXISTING models - no new models are created.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    return {
        "models": [
            {
                "id": "moving_average",
                "name": "Moyenne Glissante",
                "description": "Utilise une fenêtre glissante pour calculer la moyenne des N dernières observations",
                "parameters": [
                    {"name": "fenetre", "type": "integer", "default": 3, "min": 1, "max": 10}
                ]
            },
            {
                "id": "linear_regression",
                "name": "Régression Linéaire",
                "description": "Modèle de régression pour détecter les tendances linéaires",
                "parameters": []
            },
            {
                "id": "exponential",
                "name": "Lissage Exponentiel",
                "description": "Pondère davantage les observations récentes avec un facteur alpha",
                "parameters": [
                    {"name": "alpha", "type": "float", "default": 0.3, "min": 0.1, "max": 0.9}
                ]
            },
            {
                "id": "combined",
                "name": "Modèle Combiné (Recommandé)",
                "description": "Combine les 3 méthodes pour une prédiction plus robuste",
                "parameters": [
                    {"name": "fenetre", "type": "integer", "default": 3, "min": 1, "max": 10}
                ]
            }
        ]
    }


@router.put("/{workspace_id}/model-selection")
async def update_model_selection(
    workspace_id: uuid.UUID,
    selection: ModelSelectionUpdate,
    db: Session = Depends(get_db)
):
    """
    Update the selected ML model for a workspace.
    Does NOT modify any model code - just stores the selection.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    # Get or create model selection
    model_sel = db.query(ModelSelection).filter(
        ModelSelection.workspace_id == workspace_id
    ).first()
    
    if model_sel:
        model_sel.selected_model = selection.selected_model
        model_sel.parameters = selection.parameters or {}
        model_sel.cached_results = None  # Clear cache on model change
    else:
        model_sel = ModelSelection(
            workspace_id=workspace_id,
            selected_model=selection.selected_model,
            parameters=selection.parameters or {}
        )
        db.add(model_sel)
    
    db.commit()
    
    return {
        "success": True,
        "selected_model": selection.selected_model,
        "parameters": selection.parameters or {}
    }


# ============================================
# KPI MANAGEMENT ENDPOINTS
# ============================================

@router.get("/{workspace_id}/kpis")
async def get_kpis(workspace_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Get both standard and custom KPIs for a workspace.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    # Standard KPIs (always available)
    standard_kpis = [
        {"id": "taux_retard", "name": "Taux de Retard", "unit": "%", "type": "standard"},
        {"id": "taux_defaut", "name": "Taux de Défaut", "unit": "%", "type": "standard"},
        {"id": "retard_moyen", "name": "Retard Moyen", "unit": "jours", "type": "standard"},
        {"id": "nb_commandes", "name": "Nombre de Commandes", "unit": "", "type": "standard"},
        {"id": "taux_conformite", "name": "Taux de Conformité", "unit": "%", "type": "standard"},
        {"id": "commandes_parfaites", "name": "Commandes Parfaites", "unit": "", "type": "standard"}
    ]
    
    # Custom KPIs from database
    custom_kpis = db.query(CustomKPI).filter(
        CustomKPI.workspace_id == workspace_id
    ).all()
    
    custom_kpi_list = [
        {
            "id": str(kpi.id),
            "name": kpi.name,
            "description": kpi.description,
            "formula_type": kpi.formula_type,
            "target_field": kpi.target_field,
            "unit": kpi.unit,
            "threshold_warning": kpi.threshold_warning,
            "threshold_critical": kpi.threshold_critical,
            "is_enabled": kpi.is_enabled,
            "type": "custom"
        }
        for kpi in custom_kpis
    ]
    
    return {
        "standard_kpis": standard_kpis,
        "custom_kpis": custom_kpi_list
    }


@router.post("/{workspace_id}/kpis/custom")
async def create_custom_kpi(
    workspace_id: uuid.UUID,
    kpi_data: CustomKPICreate,
    db: Session = Depends(get_db)
):
    """
    Create a custom KPI for a workspace.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    new_kpi = CustomKPI(
        workspace_id=workspace_id,
        name=kpi_data.name,
        description=kpi_data.description,
        formula_type=kpi_data.formula_type,
        target_field=kpi_data.target_field,
        threshold_warning=kpi_data.threshold_warning,
        threshold_critical=kpi_data.threshold_critical,
        unit=kpi_data.unit,
        decimal_places=kpi_data.decimal_places
    )
    
    db.add(new_kpi)
    db.commit()
    db.refresh(new_kpi)
    
    return {
        "success": True,
        "kpi": {
            "id": str(new_kpi.id),
            "name": new_kpi.name,
            "formula_type": new_kpi.formula_type,
            "target_field": new_kpi.target_field,
            "unit": new_kpi.unit
        }
    }


@router.delete("/{workspace_id}/kpis/custom/{kpi_id}")
async def delete_custom_kpi(
    workspace_id: uuid.UUID,
    kpi_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Delete a custom KPI.
    """
    kpi = db.query(CustomKPI).filter(
        CustomKPI.id == kpi_id,
        CustomKPI.workspace_id == workspace_id
    ).first()
    
    if not kpi:
        raise HTTPException(status_code=404, detail="KPI non trouvé")
    
    db.delete(kpi)
    db.commit()
    
    return {"success": True, "message": f"KPI '{kpi.name}' supprimé"}


# ============================================
# ANALYSIS ENDPOINTS (Using Existing Models)
# ============================================

@router.get("/{workspace_id}/analysis/dashboard")
async def get_workspace_dashboard(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Get complete dashboard data for a workspace.
    Uses EXISTING ML models without modification.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible. Veuillez uploader un dataset.")
    
    # Validate required columns exist
    required_cols = ['supplier', 'delay', 'defects']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=400, 
            detail=f"Colonnes manquantes dans les données: {', '.join(missing_cols)}. Veuillez ré-uploader le dataset."
        )
    
    try:
        # Get model selection
        model_sel = db.query(ModelSelection).filter(
            ModelSelection.workspace_id == workspace_id
        ).first()
        
        fenetre = 3
        if model_sel and model_sel.parameters:
            fenetre = model_sel.parameters.get("fenetre", 3)
        
        # Use EXISTING model functions without modification
        kpis = calculer_kpis_globaux(df)
        risques = calculer_risques_fournisseurs(df)
        actions = obtenir_actions_recommandees(risques)
        predictions = calculer_predictions_avancees(df, fenetre=fenetre)
        distribution = calculer_distribution_risques(risques)
        
        # Calculate custom KPIs
        custom_kpis = db.query(CustomKPI).filter(
            CustomKPI.workspace_id == workspace_id,
            CustomKPI.is_enabled == True
        ).all()
        
        custom_kpi_values = {}
        for kpi in custom_kpis:
            if kpi.target_field in df.columns:
                if kpi.formula_type == "average":
                    value = df[kpi.target_field].mean()
                elif kpi.formula_type == "sum":
                    value = df[kpi.target_field].sum()
                elif kpi.formula_type == "percentage":
                    value = (df[kpi.target_field] > 0).mean() * 100
                else:
                    value = df[kpi.target_field].mean()
                
                custom_kpi_values[kpi.name] = round(value, kpi.decimal_places)
        
        return {
            "workspace_id": str(workspace_id),
            "workspace_name": workspace.name,
            "data_type": workspace.data_type.value,
            "kpis_globaux": kpis,
            "custom_kpis": custom_kpi_values,
            "suppliers": risques,
            "actions": actions,
            "predictions": predictions,
            "distribution": distribution,
            "selected_model": model_sel.selected_model if model_sel else "combined",
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        # Log the actual error for debugging
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur lors du calcul du dashboard: {str(e)}")


@router.get("/{workspace_id}/analysis/predictions")
async def get_workspace_predictions(
    workspace_id: uuid.UUID,
    supplier: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get predictions for a workspace, optionally filtered by supplier.
    Uses EXISTING prediction functions.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible")
    
    # Get model selection parameters
    model_sel = db.query(ModelSelection).filter(
        ModelSelection.workspace_id == workspace_id
    ).first()
    
    fenetre = 3
    if model_sel and model_sel.parameters:
        fenetre = model_sel.parameters.get("fenetre", 3)
    
    # Use EXISTING prediction function
    predictions = calculer_predictions_avancees(df, fenetre=fenetre)
    
    # Filter by supplier if specified
    if supplier:
        predictions = [p for p in predictions if p["supplier"] == supplier]
    
    # If specific model selected, highlight that method's results
    selected_model = model_sel.selected_model if model_sel else "combined"
    
    return {
        "predictions": predictions,
        "selected_model": selected_model,
        "fenetre": fenetre,
        "filtered_by": supplier
    }


@router.get("/{workspace_id}/analysis/supplier/{supplier_name}")
async def get_supplier_analysis(
    workspace_id: uuid.UUID,
    supplier_name: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed analysis for a specific supplier.
    Uses EXISTING analysis functions.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible")
    
    # Use EXISTING comparison function
    comparison = comparer_methodes_prediction(df, supplier_name)
    if not comparison:
        raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier_name}' non trouvé")
    
    # Get risk score for this supplier
    risques = calculer_risques_fournisseurs(df)
    supplier_risk = next((r for r in risques if r["supplier"] == supplier_name), None)
    
    # Get actions for this supplier
    actions = obtenir_actions_recommandees(risques)
    supplier_actions = [a for a in actions if a["supplier"] == supplier_name]
    
    return {
        "supplier": supplier_name,
        "risk_info": supplier_risk,
        "prediction_comparison": comparison,
        "recommended_actions": supplier_actions
    }
