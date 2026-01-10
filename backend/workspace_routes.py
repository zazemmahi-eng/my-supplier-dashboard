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
# LLM-based ingestion module for intelligent column mapping
from backend.llm_ingestion import (
    analyze_csv_for_mapping,
    apply_mappings_and_normalize,
    process_csv_with_llm_mapping,
    ColumnRole
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
# Each case has specific columns and generates case-specific dashboards
# ============================================

# Case A: DELAY ONLY
# For datasets containing ONLY delay data (no defects)
# Dashboard shows: delay KPIs, delay-based alerts, delay predictions
CASE_A_SCHEMA = {
    "required": ["supplier", "date_promised", "date_delivered"],
    "types": {
        "supplier": "string",
        "date_promised": "date",
        "date_delivered": "date"
    },
    "case_type": "delay_only",
    "description": "Données de retard uniquement (dates promises et livrées)"
}

# Case B: DEFECTS ONLY
# For datasets containing ONLY defect data (no delay)
# Dashboard shows: defects KPIs, defect-based alerts, defect predictions
CASE_B_SCHEMA = {
    "required": ["supplier", "order_date", "defects"],
    "types": {
        "supplier": "string",
        "order_date": "date",
        "defects": "float"
    },
    "case_type": "defects_only",
    "description": "Données de défauts uniquement (taux de défauts par commande)"
}

# Case C: MIXED (Delay + Defects)
# For datasets containing BOTH delay AND defects data
# Dashboard shows: all KPIs, combined alerts, predictions for both metrics
CASE_C_SCHEMA = {
    "required": ["supplier", "date_promised", "date_delivered", "defects"],
    "types": {
        "supplier": "string",
        "date_promised": "date",
        "date_delivered": "date",
        "defects": "float"
    },
    "case_type": "mixed",
    "description": "Données mixtes (retards ET défauts)"
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
    
    Case A (Delay Only): Calculates delay from dates, sets defects to 0
    Case B (Defects Only): Uses defects data, sets delay to 0
    Case C (Mixed): Uses both delay and defects data
    """
    processed_df = df.copy()
    
    if data_type == DataTypeCase.CASE_A:
        # ========================================
        # CASE A: DELAY ONLY
        # Accepts: supplier, date_promised, date_delivered
        # Dashboard: delay KPIs, delay alerts, delay predictions
        # ========================================
        processed_df["date_promised"] = pd.to_datetime(processed_df["date_promised"]).dt.tz_localize(None)
        processed_df["date_delivered"] = pd.to_datetime(processed_df["date_delivered"]).dt.tz_localize(None)
        # Calculate delay from dates
        processed_df["delay"] = (processed_df["date_delivered"] - processed_df["date_promised"]).dt.days
        processed_df["delay"] = processed_df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
        # Set defects to 0 for ML model compatibility (not used in Case A dashboard)
        processed_df["defects"] = 0.0
    
    elif data_type == DataTypeCase.CASE_B:
        # ========================================
        # CASE B: DEFECTS ONLY
        # Accepts: supplier, order_date, defects
        # Dashboard: defects KPIs, defect alerts, defect predictions
        # ========================================
        processed_df["order_date"] = pd.to_datetime(processed_df["order_date"]).dt.tz_localize(None)
        processed_df["defects"] = pd.to_numeric(processed_df["defects"], errors='coerce').fillna(0.0)
        # Set delay to 0 for ML model compatibility (not used in Case B dashboard)
        processed_df["delay"] = 0
        # Create date columns for compatibility with existing analysis functions
        processed_df["date_promised"] = processed_df["order_date"]
        processed_df["date_delivered"] = processed_df["order_date"]
    
    elif data_type == DataTypeCase.CASE_C:
        # ========================================
        # CASE C: MIXED (Delay + Defects)
        # Accepts: supplier, date_promised, date_delivered, defects
        # Dashboard: all KPIs, combined alerts, predictions for both
        # ========================================
        processed_df["date_promised"] = pd.to_datetime(processed_df["date_promised"]).dt.tz_localize(None)
        processed_df["date_delivered"] = pd.to_datetime(processed_df["date_delivered"]).dt.tz_localize(None)
        processed_df["defects"] = pd.to_numeric(processed_df["defects"], errors='coerce').fillna(0.0)
        # Calculate delay from dates
        processed_df["delay"] = (processed_df["date_delivered"] - processed_df["date_promised"]).dt.days
        processed_df["delay"] = processed_df["delay"].apply(lambda x: max(x, 0) if pd.notna(x) else 0)
    
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


# ============================================
# LLM-BASED CSV INGESTION ENDPOINTS
# Intelligent column mapping for arbitrary CSVs
# ============================================

class ColumnMappingRequest(BaseModel):
    """Schema for approving/editing column mappings"""
    source_column: str
    target_role: str  # supplier, date_promised, date_delivered, order_date, delay, defects, quality_score, ignore
    confidence: float = 1.0
    transformation_needed: Optional[str] = None


class ApplyMappingsRequest(BaseModel):
    """Schema for applying approved mappings"""
    mappings: List[ColumnMappingRequest]
    target_case: str  # delay_only, defects_only, mixed


@router.post("/{workspace_id}/upload/analyze", response_model=Dict[str, Any])
async def analyze_csv_for_llm_mapping(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Step 1 of LLM-based ingestion: Analyze CSV and suggest column mappings.
    
    The LLM analyzes column names and sample data to suggest appropriate mappings.
    Returns mapping suggestions with confidence scores and detected issues.
    
    User can review and edit mappings before applying them.
    """
    # Validate workspace exists
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Format invalide. Fichier CSV requis.")
    
    try:
        # Read CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="Le fichier CSV est vide.")
        
        # Analyze CSV with LLM-style column detection
        analysis = analyze_csv_for_mapping(df)
        
        # Store the raw CSV content temporarily in session/cache
        # For now, we'll return it encoded so frontend can send it back
        import base64
        csv_content_b64 = base64.b64encode(content).decode('utf-8')
        
        return {
            "success": True,
            "filename": file.filename,
            "row_count": len(df),
            "column_count": len(df.columns),
            "original_columns": list(df.columns),
            "analysis": analysis,
            "csv_content": csv_content_b64,  # Send back for step 2
            "workspace_data_type": workspace.data_type.value,
            "message": "Analyse terminée. Veuillez vérifier les mappings suggérés."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur d'analyse: {str(e)}")


@router.post("/{workspace_id}/upload/apply-mappings", response_model=Dict[str, Any])
async def apply_llm_mappings(
    workspace_id: uuid.UUID,
    csv_content: str = Query(..., description="Base64 encoded CSV content"),
    mappings: str = Query(..., description="JSON string of approved mappings"),
    target_case: str = Query(..., description="Target case: delay_only, defects_only, mixed"),
    filename: str = Query("uploaded.csv", description="Original filename"),
    db: Session = Depends(get_db)
):
    """
    Step 2 of LLM-based ingestion: Apply approved mappings and normalize data.
    
    Takes the user-approved column mappings and applies all transformations:
    - Parses dates in multiple formats
    - Computes delay from dates if needed
    - Normalizes defects to 0-1 range
    - Validates all constraints
    
    All transformations are done by Python code, NOT the LLM.
    """
    import base64
    import json
    
    # Validate workspace exists
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    try:
        # Decode CSV content
        csv_bytes = base64.b64decode(csv_content)
        df = pd.read_csv(io.BytesIO(csv_bytes))
        
        # Parse mappings
        approved_mappings = json.loads(mappings)
        
        # Map target_case to DataTypeCase
        case_mapping = {
            "delay_only": DataTypeCase.CASE_A,
            "defects_only": DataTypeCase.CASE_B,
            "mixed": DataTypeCase.CASE_C
        }
        data_type = case_mapping.get(target_case, workspace.data_type)
        
        # Apply mappings and normalize using the LLM ingestion module
        result = apply_mappings_and_normalize(df, approved_mappings, target_case)
        
        if not result.success:
            return {
                "success": False,
                "warnings": [w.message for w in result.warnings if w.severity == "warning"],
                "errors": [w.message for w in result.warnings if w.severity == "error"],
                "transformations": [t.details for t in result.transformations],
                "message": "La normalisation a échoué. Veuillez corriger les erreurs."
            }
        
        # Process with case-specific logic for backward compatibility
        processed_df = result.dataframe
        
        # Deactivate previous datasets
        db.query(WorkspaceDataset).filter(
            WorkspaceDataset.workspace_id == workspace_id
        ).update({"is_active": False})
        
        # Get date range
        date_col = "date_promised" if "date_promised" in processed_df.columns else "order_date"
        if date_col in processed_df.columns:
            date_start = processed_df[date_col].min()
            date_end = processed_df[date_col].max()
        else:
            date_start = date_end = None
        
        # Convert for JSON serialization
        df_for_json = processed_df.copy()
        for col in df_for_json.columns:
            if pd.api.types.is_datetime64_any_dtype(df_for_json[col]):
                df_for_json[col] = df_for_json[col].dt.strftime("%Y-%m-%d")
        
        # Convert dates
        date_start_py = pd.to_datetime(date_start).to_pydatetime() if pd.notna(date_start) else None
        date_end_py = pd.to_datetime(date_end).to_pydatetime() if pd.notna(date_end) else None
        
        # Update workspace data_type to match target case
        workspace.data_type = data_type
        
        # Create new dataset record
        new_dataset = WorkspaceDataset(
            workspace_id=workspace_id,
            filename=filename,
            row_count=len(processed_df),
            column_count=len(processed_df.columns),
            suppliers=processed_df["supplier"].unique().tolist() if "supplier" in processed_df.columns else [],
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
            "message": f"Données normalisées et importées avec succès (Case: {target_case})",
            "dataset_id": str(new_dataset.id),
            "summary": result.summary,
            "transformations": [t.details for t in result.transformations],
            "warnings": [w.message for w in result.warnings if w.severity == "warning"],
            "detected_case": result.detected_case
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Format de mappings invalide")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur de traitement: {str(e)}")


@router.post("/{workspace_id}/upload/smart", response_model=Dict[str, Any])
async def smart_upload_with_llm(
    workspace_id: uuid.UUID,
    file: UploadFile = File(...),
    auto_apply: bool = Query(False, description="Auto-apply high confidence mappings"),
    db: Session = Depends(get_db)
):
    """
    Combined LLM-based ingestion: Analyze and optionally auto-apply mappings.
    
    If auto_apply=True and all mappings have high confidence (>0.8), 
    automatically applies mappings and imports data.
    
    Otherwise, returns analysis for user review.
    """
    # Validate workspace exists
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Format invalide. Fichier CSV requis.")
    
    try:
        # Read CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="Le fichier CSV est vide.")
        
        # Analyze CSV
        analysis = analyze_csv_for_mapping(df)
        
        # Check if all mappings have high confidence
        all_high_confidence = all(
            m["confidence"] > 0.8 
            for m in analysis["mappings"] 
            if m["target_role"] != "ignore"
        )
        
        no_errors = not any(i["severity"] == "error" for i in analysis.get("issues", []))
        
        if auto_apply and all_high_confidence and no_errors:
            # Auto-apply mappings
            result = process_csv_with_llm_mapping(
                df, 
                user_mappings=analysis["mappings"],
                target_case=analysis["detected_case"]
            )
            
            if result.success:
                # Save to database
                processed_df = result.dataframe
                
                # Deactivate previous datasets
                db.query(WorkspaceDataset).filter(
                    WorkspaceDataset.workspace_id == workspace_id
                ).update({"is_active": False})
                
                # Map detected case to DataTypeCase
                case_mapping = {
                    "delay_only": DataTypeCase.CASE_A,
                    "defects_only": DataTypeCase.CASE_B,
                    "mixed": DataTypeCase.CASE_C
                }
                data_type = case_mapping.get(result.detected_case, workspace.data_type)
                workspace.data_type = data_type
                
                # Get date range
                date_col = "date_promised" if "date_promised" in processed_df.columns else "order_date"
                if date_col in processed_df.columns:
                    date_start = processed_df[date_col].min()
                    date_end = processed_df[date_col].max()
                else:
                    date_start = date_end = None
                
                # Convert for JSON
                df_for_json = processed_df.copy()
                for col in df_for_json.columns:
                    if pd.api.types.is_datetime64_any_dtype(df_for_json[col]):
                        df_for_json[col] = df_for_json[col].dt.strftime("%Y-%m-%d")
                
                date_start_py = pd.to_datetime(date_start).to_pydatetime() if pd.notna(date_start) else None
                date_end_py = pd.to_datetime(date_end).to_pydatetime() if pd.notna(date_end) else None
                
                new_dataset = WorkspaceDataset(
                    workspace_id=workspace_id,
                    filename=file.filename,
                    row_count=len(processed_df),
                    column_count=len(processed_df.columns),
                    suppliers=processed_df["supplier"].unique().tolist() if "supplier" in processed_df.columns else [],
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
                    "auto_applied": True,
                    "message": f"Données importées automatiquement (Case: {result.detected_case})",
                    "dataset_id": str(new_dataset.id),
                    "summary": result.summary,
                    "transformations": [t.details for t in result.transformations],
                    "warnings": [w.message for w in result.warnings if w.severity == "warning"]
                }
        
        # Return analysis for manual review
        import base64
        csv_content_b64 = base64.b64encode(content).decode('utf-8')
        
        return {
            "success": True,
            "auto_applied": False,
            "needs_review": True,
            "filename": file.filename,
            "row_count": len(df),
            "column_count": len(df.columns),
            "original_columns": list(df.columns),
            "analysis": analysis,
            "csv_content": csv_content_b64,
            "message": "Certains mappings nécessitent une vérification manuelle."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
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
    # Sample CSV templates for each data type case
    # Case A: delay only, Case B: defects only, Case C: mixed
    samples = {
        DataTypeCase.CASE_A: "supplier,date_promised,date_delivered\nSupplier A,2024-01-01,2024-01-03\nSupplier B,2024-01-05,2024-01-10",
        DataTypeCase.CASE_B: "supplier,order_date,defects\nSupplier A,2024-01-01,0.02\nSupplier B,2024-01-05,0.08",
        DataTypeCase.CASE_C: "supplier,date_promised,date_delivered,defects\nSupplier A,2024-01-01,2024-01-03,0.02\nSupplier B,2024-01-05,2024-01-10,0.08"
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
# Case-specific dashboards: A=delay, B=defects, C=mixed
# ============================================

def calculate_case_specific_kpis(df: pd.DataFrame, data_type: DataTypeCase) -> Dict[str, Any]:
    """
    Calculate KPIs specific to the data type case.
    
    Case A (Delay Only): Only delay-related KPIs
    Case B (Defects Only): Only defects-related KPIs
    Case C (Mixed): All KPIs
    """
    kpis = {}
    
    if data_type == DataTypeCase.CASE_A:
        # ========================================
        # CASE A: DELAY ONLY KPIs
        # ========================================
        total_orders = len(df)
        delayed_orders = len(df[df['delay'] > 0])
        
        kpis['taux_retard'] = round((delayed_orders / total_orders * 100) if total_orders > 0 else 0, 2)
        kpis['retard_moyen'] = round(df['delay'].mean(), 1) if len(df) > 0 else 0
        kpis['retard_max'] = int(df['delay'].max()) if len(df) > 0 else 0
        kpis['nb_commandes'] = total_orders
        kpis['nb_retards'] = delayed_orders
        kpis['commandes_a_temps'] = total_orders - delayed_orders
        kpis['taux_ponctualite'] = round(100 - kpis['taux_retard'], 2)
        
    elif data_type == DataTypeCase.CASE_B:
        # ========================================
        # CASE B: DEFECTS ONLY KPIs
        # ========================================
        total_orders = len(df)
        defective_orders = len(df[df['defects'] > 0])
        
        kpis['taux_defaut'] = round((defective_orders / total_orders * 100) if total_orders > 0 else 0, 2)
        kpis['defaut_moyen'] = round(df['defects'].mean() * 100, 2) if len(df) > 0 else 0
        kpis['defaut_max'] = round(df['defects'].max() * 100, 2) if len(df) > 0 else 0
        kpis['nb_commandes'] = total_orders
        kpis['nb_defectueux'] = defective_orders
        kpis['commandes_conformes'] = total_orders - defective_orders
        kpis['taux_conformite'] = round(100 - kpis['taux_defaut'], 2)
        
    elif data_type == DataTypeCase.CASE_C:
        # ========================================
        # CASE C: MIXED KPIs (Both delay and defects)
        # ========================================
        total_orders = len(df)
        delayed_orders = len(df[df['delay'] > 0])
        defective_orders = len(df[df['defects'] > 0])
        perfect_orders = len(df[(df['delay'] == 0) & (df['defects'] == 0)])
        
        # Delay KPIs
        kpis['taux_retard'] = round((delayed_orders / total_orders * 100) if total_orders > 0 else 0, 2)
        kpis['retard_moyen'] = round(df['delay'].mean(), 1) if len(df) > 0 else 0
        
        # Defects KPIs
        kpis['taux_defaut'] = round((defective_orders / total_orders * 100) if total_orders > 0 else 0, 2)
        kpis['defaut_moyen'] = round(df['defects'].mean() * 100, 2) if len(df) > 0 else 0
        
        # Combined KPIs
        kpis['nb_commandes'] = total_orders
        kpis['commandes_parfaites'] = perfect_orders
        kpis['taux_conformite'] = round((perfect_orders / total_orders * 100) if total_orders > 0 else 0, 2)
    
    return kpis


def calculate_case_specific_supplier_risks(df: pd.DataFrame, data_type: DataTypeCase) -> List[Dict[str, Any]]:
    """
    Calculate supplier risks specific to the data type case.
    
    Case A: Risk based on delay only
    Case B: Risk based on defects only
    Case C: Risk based on both metrics
    """
    risques = []
    
    for supplier in df['supplier'].unique():
        supplier_df = df[df['supplier'] == supplier]
        n_orders = len(supplier_df)
        
        supplier_data = {
            'supplier': supplier,
            'nb_commandes': n_orders,
        }
        
        if data_type == DataTypeCase.CASE_A:
            # ========================================
            # CASE A: DELAY-BASED RISK
            # ========================================
            retard_moyen = supplier_df['delay'].mean()
            taux_retard = (supplier_df['delay'] > 0).mean() * 100
            
            # Risk score based on delay only (0-100)
            score_risque = min(100, int(retard_moyen * 5 + taux_retard * 0.5))
            
            supplier_data.update({
                'retard_moyen': round(retard_moyen, 1),
                'taux_retard': round(taux_retard, 1),
                'score_risque': score_risque,
                'niveau_risque': 'Élevé' if score_risque > 55 else 'Modéré' if score_risque > 25 else 'Faible',
                'status': 'eleve' if score_risque > 55 else 'modere' if score_risque > 25 else 'faible',
                'tendance_retards': 'hausse' if len(supplier_df) >= 3 and supplier_df['delay'].iloc[-1] > supplier_df['delay'].mean() else 'baisse'
            })
            
        elif data_type == DataTypeCase.CASE_B:
            # ========================================
            # CASE B: DEFECTS-BASED RISK
            # ========================================
            defaut_moyen = supplier_df['defects'].mean() * 100
            taux_defaut = (supplier_df['defects'] > 0).mean() * 100
            
            # Risk score based on defects only (0-100)
            score_risque = min(100, int(defaut_moyen * 2 + taux_defaut * 0.5))
            
            supplier_data.update({
                'taux_defaut': round(taux_defaut, 1),
                'defaut_moyen': round(defaut_moyen, 2),
                'score_risque': score_risque,
                'niveau_risque': 'Élevé' if score_risque > 55 else 'Modéré' if score_risque > 25 else 'Faible',
                'status': 'eleve' if score_risque > 55 else 'modere' if score_risque > 25 else 'faible',
                'tendance_defauts': 'hausse' if len(supplier_df) >= 3 and supplier_df['defects'].iloc[-1] > supplier_df['defects'].mean() else 'baisse'
            })
            
        elif data_type == DataTypeCase.CASE_C:
            # ========================================
            # CASE C: COMBINED RISK (delay + defects)
            # ========================================
            retard_moyen = supplier_df['delay'].mean()
            taux_retard = (supplier_df['delay'] > 0).mean() * 100
            defaut_moyen = supplier_df['defects'].mean() * 100
            taux_defaut = (supplier_df['defects'] > 0).mean() * 100
            
            # Combined risk score (0-100)
            score_risque = min(100, int(
                retard_moyen * 3 + 
                taux_retard * 0.3 + 
                defaut_moyen * 1.5 + 
                taux_defaut * 0.3
            ))
            
            supplier_data.update({
                'retard_moyen': round(retard_moyen, 1),
                'taux_retard': round(taux_retard, 1),
                'taux_defaut': round(taux_defaut, 1),
                'defaut_moyen': round(defaut_moyen, 2),
                'score_risque': score_risque,
                'niveau_risque': 'Élevé' if score_risque > 55 else 'Modéré' if score_risque > 25 else 'Faible',
                'status': 'eleve' if score_risque > 55 else 'modere' if score_risque > 25 else 'faible',
                'tendance_retards': 'hausse' if len(supplier_df) >= 3 and supplier_df['delay'].iloc[-1] > supplier_df['delay'].mean() else 'baisse',
                'tendance_defauts': 'hausse' if len(supplier_df) >= 3 and supplier_df['defects'].iloc[-1] > supplier_df['defects'].mean() else 'baisse'
            })
        
        risques.append(supplier_data)
    
    # Sort by risk score descending
    risques.sort(key=lambda x: x['score_risque'], reverse=True)
    return risques


def calculate_case_specific_actions(risques: List[Dict], data_type: DataTypeCase) -> List[Dict[str, Any]]:
    """
    Generate recommended actions specific to the data type case.
    
    Case A: Actions focused on delay reduction
    Case B: Actions focused on defect reduction
    Case C: Actions for both metrics
    """
    actions = []
    
    for r in risques:
        supplier = r['supplier']
        niveau = r['niveau_risque']
        
        if data_type == DataTypeCase.CASE_A:
            # ========================================
            # CASE A: DELAY-FOCUSED ACTIONS
            # ========================================
            if niveau == 'Élevé':
                actions.append({
                    'supplier': supplier,
                    'action': 'Renégocier les délais de livraison',
                    'priority': 'high',
                    'raison': f"Retard moyen de {r.get('retard_moyen', 0)} jours",
                    'delai': 'Immédiat',
                    'impact': 'Réduction des retards de 30-50%'
                })
            elif niveau == 'Modéré':
                actions.append({
                    'supplier': supplier,
                    'action': 'Mettre en place un suivi hebdomadaire des livraisons',
                    'priority': 'medium',
                    'raison': f"Taux de retard de {r.get('taux_retard', 0)}%",
                    'delai': '2 semaines',
                    'impact': 'Amélioration de la ponctualité'
                })
                
        elif data_type == DataTypeCase.CASE_B:
            # ========================================
            # CASE B: DEFECT-FOCUSED ACTIONS
            # ========================================
            if niveau == 'Élevé':
                actions.append({
                    'supplier': supplier,
                    'action': 'Audit qualité approfondi',
                    'priority': 'high',
                    'raison': f"Taux de défaut de {r.get('taux_defaut', 0)}%",
                    'delai': 'Immédiat',
                    'impact': 'Réduction des défauts de 40-60%'
                })
            elif niveau == 'Modéré':
                actions.append({
                    'supplier': supplier,
                    'action': 'Renforcer les contrôles qualité à réception',
                    'priority': 'medium',
                    'raison': f"Défaut moyen de {r.get('defaut_moyen', 0)}%",
                    'delai': '1 mois',
                    'impact': 'Amélioration de la conformité'
                })
                
        elif data_type == DataTypeCase.CASE_C:
            # ========================================
            # CASE C: COMBINED ACTIONS
            # ========================================
            if niveau == 'Élevé':
                # Check which metric is worse
                has_delay_issue = r.get('taux_retard', 0) > 30
                has_defect_issue = r.get('taux_defaut', 0) > 30
                
                if has_delay_issue and has_defect_issue:
                    actions.append({
                        'supplier': supplier,
                        'action': 'Plan d\'amélioration complet (délais + qualité)',
                        'priority': 'high',
                        'raison': f"Retard: {r.get('retard_moyen', 0)}j, Défaut: {r.get('taux_defaut', 0)}%",
                        'delai': 'Immédiat',
                        'impact': 'Amélioration globale de 40%'
                    })
                elif has_delay_issue:
                    actions.append({
                        'supplier': supplier,
                        'action': 'Renégocier les délais de livraison',
                        'priority': 'high',
                        'raison': f"Retard moyen de {r.get('retard_moyen', 0)} jours",
                        'delai': 'Immédiat',
                        'impact': 'Réduction des retards de 30-50%'
                    })
                else:
                    actions.append({
                        'supplier': supplier,
                        'action': 'Audit qualité approfondi',
                        'priority': 'high',
                        'raison': f"Taux de défaut de {r.get('taux_defaut', 0)}%",
                        'delai': 'Immédiat',
                        'impact': 'Réduction des défauts de 40-60%'
                    })
            elif niveau == 'Modéré':
                actions.append({
                    'supplier': supplier,
                    'action': 'Suivi mensuel des performances',
                    'priority': 'medium',
                    'raison': f"Score de risque: {r.get('score_risque', 0)}",
                    'delai': '1 mois',
                    'impact': 'Maintien de la qualité de service'
                })
    
    return actions


def calculate_case_specific_predictions(df: pd.DataFrame, data_type: DataTypeCase, fenetre: int = 3) -> List[Dict[str, Any]]:
    """
    Calculate predictions specific to the data type case.
    Uses existing ML model functions but filters output based on case.
    
    Case A: Only delay predictions
    Case B: Only defect predictions
    Case C: Both predictions
    """
    predictions = []
    
    for supplier in df['supplier'].unique():
        supplier_df = df[df['supplier'] == supplier]
        n_orders = len(supplier_df)
        
        pred = {
            'supplier': supplier,
            'nb_commandes_historique': n_orders,
            'confiance': 'haute' if n_orders >= 10 else 'moyenne' if n_orders >= 5 else 'basse'
        }
        
        if data_type == DataTypeCase.CASE_A:
            # ========================================
            # CASE A: DELAY PREDICTIONS ONLY
            # ========================================
            delays = supplier_df['delay'].values
            # Simple moving average prediction
            if len(delays) >= fenetre:
                pred['predicted_delay'] = round(float(delays[-fenetre:].mean()), 1)
            else:
                pred['predicted_delay'] = round(float(delays.mean()), 1)
            pred['predicted_defect'] = None  # Not applicable for Case A
            
        elif data_type == DataTypeCase.CASE_B:
            # ========================================
            # CASE B: DEFECT PREDICTIONS ONLY
            # ========================================
            defects = supplier_df['defects'].values
            # Simple moving average prediction
            if len(defects) >= fenetre:
                pred['predicted_defect'] = round(float(defects[-fenetre:].mean()) * 100, 2)
            else:
                pred['predicted_defect'] = round(float(defects.mean()) * 100, 2)
            pred['predicted_delay'] = None  # Not applicable for Case B
            
        elif data_type == DataTypeCase.CASE_C:
            # ========================================
            # CASE C: BOTH PREDICTIONS
            # ========================================
            delays = supplier_df['delay'].values
            defects = supplier_df['defects'].values
            
            # Delay prediction
            if len(delays) >= fenetre:
                pred['predicted_delay'] = round(float(delays[-fenetre:].mean()), 1)
            else:
                pred['predicted_delay'] = round(float(delays.mean()), 1)
            
            # Defect prediction
            if len(defects) >= fenetre:
                pred['predicted_defect'] = round(float(defects[-fenetre:].mean()) * 100, 2)
            else:
                pred['predicted_defect'] = round(float(defects.mean()) * 100, 2)
        
        predictions.append(pred)
    
    return predictions


@router.get("/{workspace_id}/analysis/dashboard")
async def get_workspace_dashboard(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Get complete dashboard data for a workspace.
    Returns CASE-SPECIFIC KPIs, alerts, and predictions based on workspace data_type.
    
    Case A (delay_only): Delay KPIs, delay alerts, delay predictions
    Case B (defects_only): Defect KPIs, defect alerts, defect predictions  
    Case C (mixed): All KPIs, combined alerts, all predictions
    
    Uses EXISTING ML models without modification.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible. Veuillez uploader un dataset.")
    
    # Validate required columns exist (delay and defects are always present after processing)
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
        
        # ========================================
        # CASE-SPECIFIC CALCULATIONS
        # Each case gets its own KPIs, risks, actions, and predictions
        # ========================================
        
        # Calculate case-specific KPIs
        kpis = calculate_case_specific_kpis(df, workspace.data_type)
        
        # Calculate case-specific supplier risks
        risques = calculate_case_specific_supplier_risks(df, workspace.data_type)
        
        # Calculate case-specific recommended actions
        actions = calculate_case_specific_actions(risques, workspace.data_type)
        
        # Calculate case-specific predictions
        predictions = calculate_case_specific_predictions(df, workspace.data_type, fenetre)
        
        # Calculate risk distribution
        distribution = {
            'faible': {'count': len([r for r in risques if r['niveau_risque'] == 'Faible']), 'label': 'Faible'},
            'modere': {'count': len([r for r in risques if r['niveau_risque'] == 'Modéré']), 'label': 'Modéré'},
            'eleve': {'count': len([r for r in risques if r['niveau_risque'] == 'Élevé']), 'label': 'Élevé'}
        }
        
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
        
        # Get case type description for frontend
        schema = get_schema_for_case(workspace.data_type)
        
        return {
            "workspace_id": str(workspace_id),
            "workspace_name": workspace.name,
            "data_type": workspace.data_type.value,
            "case_type": schema.get("case_type", "unknown"),
            "case_description": schema.get("description", ""),
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


# ============================================
# MULTI-MODEL COMPARISON ENDPOINTS
# Run and compare predictions from multiple models
# ============================================

@router.get("/{workspace_id}/analysis/multi-model")
async def get_multi_model_predictions(
    workspace_id: uuid.UUID,
    models: str = Query("all", description="Comma-separated model IDs or 'all'"),
    supplier: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Run predictions using multiple models and return side-by-side comparison.
    
    Models available: moving_average, linear_regression, exponential, combined
    
    Returns predictions from each selected model for comparison.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible")
    
    # Get model parameters
    model_sel = db.query(ModelSelection).filter(
        ModelSelection.workspace_id == workspace_id
    ).first()
    
    fenetre = 3
    alpha = 0.3
    if model_sel and model_sel.parameters:
        fenetre = model_sel.parameters.get("fenetre", 3)
        alpha = model_sel.parameters.get("alpha", 0.3)
    
    # Determine which models to run
    available_models = ["moving_average", "linear_regression", "exponential", "combined"]
    if models == "all":
        selected_models = available_models
    else:
        selected_models = [m.strip() for m in models.split(",") if m.strip() in available_models]
    
    if not selected_models:
        raise HTTPException(status_code=400, detail="Aucun modèle valide sélectionné")
    
    # Filter by supplier if specified
    suppliers = [supplier] if supplier else df['supplier'].unique().tolist()
    
    # Calculate predictions for each model and supplier
    from backend.mon_analyse import (
        prediction_moyenne_mobile,
        prediction_regression_lineaire,
        prediction_lissage_exponentiel
    )
    
    results = []
    
    for sup in suppliers:
        supplier_df = df[df['supplier'] == sup]
        if len(supplier_df) < 2:
            continue
        
        delays = supplier_df['delay'].values
        defects = supplier_df['defects'].values
        n_orders = len(supplier_df)
        
        supplier_result = {
            "supplier": sup,
            "nb_commandes": n_orders,
            "predictions": {}
        }
        
        # Moving Average
        if "moving_average" in selected_models:
            ma_delay = prediction_moyenne_mobile(delays, fenetre)
            ma_defect = prediction_moyenne_mobile(defects * 100, fenetre)  # Convert to percentage
            supplier_result["predictions"]["moving_average"] = {
                "delay": round(ma_delay, 1) if ma_delay else None,
                "defect": round(ma_defect, 2) if ma_defect else None,
                "name": "Moyenne Glissante",
                "parameters": {"fenetre": fenetre}
            }
        
        # Linear Regression
        if "linear_regression" in selected_models:
            lr_delay = prediction_regression_lineaire(delays)
            lr_defect = prediction_regression_lineaire(defects * 100)
            supplier_result["predictions"]["linear_regression"] = {
                "delay": round(lr_delay, 1) if lr_delay else None,
                "defect": round(lr_defect, 2) if lr_defect else None,
                "name": "Régression Linéaire",
                "parameters": {}
            }
        
        # Exponential Smoothing
        if "exponential" in selected_models:
            exp_delay = prediction_lissage_exponentiel(delays, alpha)
            exp_defect = prediction_lissage_exponentiel(defects * 100, alpha)
            supplier_result["predictions"]["exponential"] = {
                "delay": round(exp_delay, 1) if exp_delay else None,
                "defect": round(exp_defect, 2) if exp_defect else None,
                "name": "Lissage Exponentiel",
                "parameters": {"alpha": alpha}
            }
        
        # Combined (average of all methods)
        if "combined" in selected_models:
            all_delays = []
            all_defects = []
            
            ma_d = prediction_moyenne_mobile(delays, fenetre)
            lr_d = prediction_regression_lineaire(delays)
            exp_d = prediction_lissage_exponentiel(delays, alpha)
            
            ma_def = prediction_moyenne_mobile(defects * 100, fenetre)
            lr_def = prediction_regression_lineaire(defects * 100)
            exp_def = prediction_lissage_exponentiel(defects * 100, alpha)
            
            for v in [ma_d, lr_d, exp_d]:
                if v is not None:
                    all_delays.append(v)
            for v in [ma_def, lr_def, exp_def]:
                if v is not None:
                    all_defects.append(v)
            
            combined_delay = sum(all_delays) / len(all_delays) if all_delays else None
            combined_defect = sum(all_defects) / len(all_defects) if all_defects else None
            
            supplier_result["predictions"]["combined"] = {
                "delay": round(combined_delay, 1) if combined_delay else None,
                "defect": round(combined_defect, 2) if combined_defect else None,
                "name": "Combiné (Moyenne)",
                "parameters": {"fenetre": fenetre, "alpha": alpha}
            }
        
        # Add case-specific filtering
        if workspace.data_type == DataTypeCase.CASE_A:
            # Delay only: null out defect predictions
            for model in supplier_result["predictions"].values():
                model["defect"] = None
        elif workspace.data_type == DataTypeCase.CASE_B:
            # Defects only: null out delay predictions
            for model in supplier_result["predictions"].values():
                model["delay"] = None
        
        results.append(supplier_result)
    
    return {
        "workspace_id": str(workspace_id),
        "case_type": workspace.data_type.value,
        "selected_models": selected_models,
        "parameters": {"fenetre": fenetre, "alpha": alpha},
        "results": results,
        "timestamp": datetime.now().isoformat()
    }


# ============================================
# EXPORT ENDPOINTS (PDF/Excel)
# ============================================

@router.get("/{workspace_id}/export/excel")
async def export_to_excel(
    workspace_id: uuid.UUID,
    include_dashboard: bool = Query(True, description="Include dashboard KPIs"),
    include_predictions: bool = Query(True, description="Include predictions"),
    include_actions: bool = Query(True, description="Include recommended actions"),
    supplier: Optional[str] = Query(None, description="Filter by supplier"),
    db: Session = Depends(get_db)
):
    """
    Export workspace data, dashboard, and predictions to Excel format.
    Supports filtering by supplier.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible")
    
    try:
        # Filter by supplier if specified
        if supplier:
            df = df[df['supplier'] == supplier]
            if df.empty:
                raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier}' non trouvé")
        
        # Create Excel file in memory
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Sheet 1: Raw Data
            df_export = df.copy()
            df_export.to_excel(writer, sheet_name='Données', index=False)
            
            # Sheet 2: Dashboard KPIs
            if include_dashboard:
                kpis = calculate_case_specific_kpis(df, workspace.data_type)
                kpi_df = pd.DataFrame([
                    {"KPI": k, "Valeur": v} for k, v in kpis.items()
                ])
                kpi_df.to_excel(writer, sheet_name='KPIs', index=False)
            
            # Sheet 3: Supplier Risks
            risques = calculate_case_specific_supplier_risks(df, workspace.data_type)
            if supplier:
                risques = [r for r in risques if r['supplier'] == supplier]
            risques_df = pd.DataFrame(risques)
            risques_df.to_excel(writer, sheet_name='Risques Fournisseurs', index=False)
            
            # Sheet 4: Predictions
            if include_predictions:
                predictions = calculate_case_specific_predictions(df, workspace.data_type)
                if supplier:
                    predictions = [p for p in predictions if p['supplier'] == supplier]
                pred_df = pd.DataFrame(predictions)
                pred_df.to_excel(writer, sheet_name='Prédictions', index=False)
            
            # Sheet 5: Recommended Actions
            if include_actions:
                actions = calculate_case_specific_actions(risques, workspace.data_type)
                if supplier:
                    actions = [a for a in actions if a['supplier'] == supplier]
                actions_df = pd.DataFrame(actions)
                actions_df.to_excel(writer, sheet_name='Actions Recommandées', index=False)
        
        output.seek(0)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"workspace_{workspace.name}_{timestamp}"
        if supplier:
            filename += f"_{supplier}"
        filename += ".xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur d'export: {str(e)}")


@router.get("/{workspace_id}/export/csv")
async def export_to_csv(
    workspace_id: uuid.UUID,
    data_type: str = Query("all", description="all, kpis, risks, predictions, actions"),
    supplier: Optional[str] = Query(None, description="Filter by supplier"),
    db: Session = Depends(get_db)
):
    """
    Export workspace data to CSV format.
    Choose what to export: raw data, KPIs, risks, predictions, or actions.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible")
    
    try:
        # Filter by supplier if specified
        if supplier:
            df = df[df['supplier'] == supplier]
            if df.empty:
                raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier}' non trouvé")
        
        output = io.StringIO()
        
        if data_type == "all" or data_type == "data":
            df.to_csv(output, index=False)
        elif data_type == "kpis":
            kpis = calculate_case_specific_kpis(df, workspace.data_type)
            kpi_df = pd.DataFrame([{"KPI": k, "Valeur": v} for k, v in kpis.items()])
            kpi_df.to_csv(output, index=False)
        elif data_type == "risks":
            risques = calculate_case_specific_supplier_risks(df, workspace.data_type)
            if supplier:
                risques = [r for r in risques if r['supplier'] == supplier]
            pd.DataFrame(risques).to_csv(output, index=False)
        elif data_type == "predictions":
            predictions = calculate_case_specific_predictions(df, workspace.data_type)
            if supplier:
                predictions = [p for p in predictions if p['supplier'] == supplier]
            pd.DataFrame(predictions).to_csv(output, index=False)
        elif data_type == "actions":
            risques = calculate_case_specific_supplier_risks(df, workspace.data_type)
            actions = calculate_case_specific_actions(risques, workspace.data_type)
            if supplier:
                actions = [a for a in actions if a['supplier'] == supplier]
            pd.DataFrame(actions).to_csv(output, index=False)
        else:
            raise HTTPException(status_code=400, detail="Type d'export invalide")
        
        output.seek(0)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"workspace_{workspace.name}_{data_type}_{timestamp}"
        if supplier:
            filename += f"_{supplier}"
        filename += ".csv"
        
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode('utf-8')),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur d'export: {str(e)}")


@router.get("/{workspace_id}/export/report")
async def export_report_summary(
    workspace_id: uuid.UUID,
    supplier: Optional[str] = Query(None, description="Filter by supplier"),
    db: Session = Depends(get_db)
):
    """
    Export a summary report in JSON format.
    Can be used to generate PDF reports on the frontend.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible")
    
    try:
        # Filter by supplier if specified
        if supplier:
            df_filtered = df[df['supplier'] == supplier]
            if df_filtered.empty:
                raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier}' non trouvé")
        else:
            df_filtered = df
        
        # Calculate all data
        kpis = calculate_case_specific_kpis(df_filtered, workspace.data_type)
        risques = calculate_case_specific_supplier_risks(df_filtered, workspace.data_type)
        actions = calculate_case_specific_actions(risques, workspace.data_type)
        predictions = calculate_case_specific_predictions(df_filtered, workspace.data_type)
        
        if supplier:
            risques = [r for r in risques if r['supplier'] == supplier]
            actions = [a for a in actions if a['supplier'] == supplier]
            predictions = [p for p in predictions if p['supplier'] == supplier]
        
        # Get schema info
        schema = get_schema_for_case(workspace.data_type)
        
        report = {
            "report_info": {
                "workspace_name": workspace.name,
                "workspace_id": str(workspace_id),
                "generated_at": datetime.now().isoformat(),
                "filtered_by_supplier": supplier,
                "case_type": schema.get("case_type"),
                "case_description": schema.get("description")
            },
            "data_summary": {
                "total_rows": len(df_filtered),
                "total_suppliers": df_filtered['supplier'].nunique(),
                "suppliers": df_filtered['supplier'].unique().tolist(),
                "date_range": {
                    "start": df_filtered['date_promised'].min().strftime("%Y-%m-%d") if 'date_promised' in df_filtered.columns else None,
                    "end": df_filtered['date_promised'].max().strftime("%Y-%m-%d") if 'date_promised' in df_filtered.columns else None
                }
            },
            "kpis": kpis,
            "risk_distribution": {
                "faible": len([r for r in risques if r.get('niveau_risque') == 'Faible']),
                "modere": len([r for r in risques if r.get('niveau_risque') == 'Modéré']),
                "eleve": len([r for r in risques if r.get('niveau_risque') == 'Élevé'])
            },
            "supplier_risks": risques,
            "predictions": predictions,
            "recommended_actions": {
                "high_priority": [a for a in actions if a.get('priority') == 'high'],
                "medium_priority": [a for a in actions if a.get('priority') == 'medium'],
                "low_priority": [a for a in actions if a.get('priority') == 'low']
            }
        }
        
        return report
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur de génération du rapport: {str(e)}")
