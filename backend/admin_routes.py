# admin_routes.py
"""
FastAPI routes for Admin functionality.

SECURITY RULES:
- All routes require admin authentication
- Admin can only VIEW (read-only) user data
- Admin CAN create/delete users
- Admin CANNOT modify user data, workspaces, KPIs, or predictions

Endpoints:
- GET /api/admin/stats - Global application statistics
- GET /api/admin/users - List all users
- GET /api/admin/users/{user_id} - Get user details
- DELETE /api/admin/users/{user_id} - Delete user (with all their data)
- GET /api/admin/users/{user_id}/workspaces - List user's workspaces
- GET /api/admin/users/{user_id}/workspaces/{workspace_id}/dashboard - View user's workspace dashboard (READ-ONLY)
- POST /api/admin/users - Create new user
"""

import uuid
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from pydantic import BaseModel, Field

from backend.database import get_db, engine
from backend.admin_models import UserRole, UserRoleAssignment, AdminAuditLog
from backend.workspace_models import Workspace, WorkspaceDataset, CustomKPI, DataTypeCase


# ============================================
# ROUTER CONFIGURATION
# ============================================

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================
# PYDANTIC SCHEMAS
# ============================================

class AdminStatsResponse(BaseModel):
    """Global application statistics"""
    total_users: int
    total_workspaces: int
    workspaces_per_user: float
    total_suppliers: int
    workspace_types: Dict[str, int]
    active_users: int


class UserListItem(BaseModel):
    """User item in list"""
    id: str
    email: str
    display_name: Optional[str]
    role: str
    workspace_count: int
    supplier_count: int
    created_at: datetime
    is_active: bool


class UserCreateRequest(BaseModel):
    """Request to create a new user"""
    email: str = Field(..., description="User email address")
    display_name: Optional[str] = None
    password: str = Field(..., min_length=8)
    role: str = "user"


class AdminUserInfo(BaseModel):
    """Admin user info from auth"""
    user_id: str
    email: str
    role: str


# ============================================
# ADMIN AUTHENTICATION DEPENDENCY
# ============================================

async def get_current_admin(
    x_admin_user_id: Optional[str] = Header(None, alias="X-Admin-User-ID"),
    x_admin_email: Optional[str] = Header(None, alias="X-Admin-Email"),
    db: Session = Depends(get_db)
) -> AdminUserInfo:
    """
    Verify that the current user is an admin.
    
    This dependency checks the X-Admin-User-ID header against the user_roles table.
    In production, this should also verify the JWT token from Supabase.
    
    Raises HTTPException 403 if not admin.
    """
    if not x_admin_user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Missing X-Admin-User-ID header."
        )
    
    try:
        user_uuid = uuid.UUID(x_admin_user_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid user ID format"
        )
    
    # Check user role in database
    user_role = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if not user_role:
        raise HTTPException(
            status_code=403,
            detail="Access denied. User not found in role system."
        )
    
    if user_role.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required."
        )
    
    if not user_role.is_active:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin account is deactivated."
        )
    
    return AdminUserInfo(
        user_id=str(user_uuid),
        email=x_admin_email or user_role.email or "",
        role="admin"
    )


# ============================================
# AUDIT LOGGING HELPER
# ============================================

def log_admin_action(
    db: Session,
    admin_user_id: str,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None
):
    """Log an admin action for audit trail."""
    log_entry = AdminAuditLog(
        admin_user_id=uuid.UUID(admin_user_id),
        action=action,
        target_type=target_type,
        target_id=uuid.UUID(target_id) if target_id else None,
        details=details,
        ip_address=ip_address
    )
    db.add(log_entry)
    db.commit()


# ============================================
# PUBLIC ROLE CHECK ENDPOINT (No admin auth required)
# ============================================

@router.get("/check-user-role")
async def check_user_role(
    user_id: str,
    db: Session = Depends(get_db)
):
    """
    Check if a user has admin role.
    
    This endpoint is used after Supabase authentication to determine
    where to redirect the user (admin panel vs user dashboard).
    
    Called from the auth callback to check role BEFORE setting admin headers.
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        return {"role": "user", "is_admin": False, "redirect": "/dashboard"}
    
    # Check user role in database
    user_role = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if not user_role:
        # User not in role system = regular user
        return {
            "role": "user",
            "is_admin": False,
            "redirect": "/dashboard",
            "display_name": None
        }
    
    if user_role.role == UserRole.ADMIN and user_role.is_active:
        return {
            "role": "admin",
            "is_admin": True,
            "redirect": "/admin",
            "display_name": user_role.display_name,
            "email": user_role.email
        }
    
    return {
        "role": "user",
        "is_admin": False,
        "redirect": "/dashboard",
        "display_name": user_role.display_name
    }


@router.post("/promote-to-admin")
async def promote_user_to_admin(
    user_id: str,
    email: str,
    display_name: Optional[str] = None,
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Promote an existing user to admin role.
    Only existing admins can promote others.
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    # Check if already has a role
    existing_role = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if existing_role:
        if existing_role.role == UserRole.ADMIN:
            raise HTTPException(status_code=400, detail="User is already an admin")
        
        # Update to admin
        existing_role.role = UserRole.ADMIN
        existing_role.assigned_by = uuid.UUID(admin.user_id)
        existing_role.display_name = display_name or existing_role.display_name
        db.commit()
    else:
        # Create new admin role
        new_role = UserRoleAssignment(
            user_id=user_uuid,
            email=email,
            display_name=display_name,
            role=UserRole.ADMIN,
            assigned_by=uuid.UUID(admin.user_id),
            is_active=True
        )
        db.add(new_role)
        db.commit()
    
    # Log the action
    log_admin_action(
        db=db,
        admin_user_id=admin.user_id,
        action="promote_to_admin",
        target_type="user",
        target_id=user_id,
        details=f"Promoted {email} to admin role"
    )
    
    return {
        "success": True,
        "message": f"User {email} has been promoted to admin",
        "user_id": user_id
    }


# ============================================
# ADMIN ENDPOINTS
# ============================================

@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get global application statistics.
    Admin only.
    """
    # Total users (from user_roles table)
    total_users = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.is_active == True
    ).count()
    
    # Total workspaces
    total_workspaces = db.query(Workspace).count()
    
    # Workspaces per user (average)
    workspaces_per_user = total_workspaces / max(total_users, 1)
    
    # Total suppliers across all workspaces
    total_suppliers = 0
    datasets = db.query(WorkspaceDataset).filter(
        WorkspaceDataset.is_active == True
    ).all()
    
    for dataset in datasets:
        if dataset.suppliers:
            total_suppliers += len(dataset.suppliers)
    
    # Workspace types distribution
    workspace_types = {
        "delays": 0,
        "late_days": 0,
        "mixed": 0
    }
    
    workspaces = db.query(Workspace).all()
    for ws in workspaces:
        if ws.data_type.value in workspace_types:
            workspace_types[ws.data_type.value] += 1
    
    # Active users (users with at least one workspace)
    users_with_workspaces = db.query(Workspace.owner_id).distinct().count()
    
    # Log admin action
    log_admin_action(
        db, admin.user_id, "VIEW_GLOBAL_STATS"
    )
    
    return AdminStatsResponse(
        total_users=total_users,
        total_workspaces=total_workspaces,
        workspaces_per_user=round(workspaces_per_user, 2),
        total_suppliers=total_suppliers,
        workspace_types=workspace_types,
        active_users=users_with_workspaces
    )


@router.get("/users", response_model=List[UserListItem])
async def list_users(
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all users with their workspace and supplier counts.
    Admin only.
    """
    users = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.is_active == True
    ).order_by(UserRoleAssignment.created_at.desc()).all()
    
    result = []
    for user in users:
        # Count workspaces for this user
        workspace_count = db.query(Workspace).filter(
            Workspace.owner_id == user.user_id
        ).count()
        
        # Count suppliers for this user
        supplier_count = 0
        user_workspaces = db.query(Workspace).filter(
            Workspace.owner_id == user.user_id
        ).all()
        
        for ws in user_workspaces:
            dataset = db.query(WorkspaceDataset).filter(
                WorkspaceDataset.workspace_id == ws.id,
                WorkspaceDataset.is_active == True
            ).first()
            if dataset and dataset.suppliers:
                supplier_count += len(dataset.suppliers)
        
        result.append(UserListItem(
            id=str(user.user_id),
            email=user.email or "N/A",
            display_name=user.display_name,
            role=user.role.value,
            workspace_count=workspace_count,
            supplier_count=supplier_count,
            created_at=user.created_at,
            is_active=user.is_active
        ))
    
    # Log admin action
    log_admin_action(
        db, admin.user_id, "LIST_USERS",
        details=f"Listed {len(result)} users"
    )
    
    return result


@router.get("/users/{user_id}")
async def get_user_details(
    user_id: str,
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific user.
    Admin only, READ-ONLY.
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    user = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get user's workspaces
    workspaces = db.query(Workspace).filter(
        Workspace.owner_id == user_uuid
    ).all()
    
    workspace_data = []
    total_suppliers = 0
    total_orders = 0
    
    for ws in workspaces:
        dataset = db.query(WorkspaceDataset).filter(
            WorkspaceDataset.workspace_id == ws.id,
            WorkspaceDataset.is_active == True
        ).first()
        
        supplier_count = len(dataset.suppliers) if dataset and dataset.suppliers else 0
        row_count = dataset.row_count if dataset else 0
        
        total_suppliers += supplier_count
        total_orders += row_count
        
        workspace_data.append({
            "id": str(ws.id),
            "name": ws.name,
            "description": ws.description,
            "data_type": ws.data_type.value,
            "status": ws.status.value,
            "supplier_count": supplier_count,
            "order_count": row_count,
            "has_data": dataset is not None,
            "created_at": ws.created_at.isoformat() if ws.created_at else None
        })
    
    # Log admin action
    log_admin_action(
        db, admin.user_id, "VIEW_USER_DETAILS",
        target_type="user",
        target_id=user_id
    )
    
    return {
        "user": {
            "id": str(user.user_id),
            "email": user.email or "N/A",
            "display_name": user.display_name,
            "role": user.role.value,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None
        },
        "stats": {
            "workspace_count": len(workspaces),
            "total_suppliers": total_suppliers,
            "total_orders": total_orders
        },
        "workspaces": workspace_data
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Delete a user and all their data.
    Admin only.
    
    WARNING: This will delete:
    - All user workspaces
    - All workspace datasets
    - All custom KPIs
    - All model selections
    - The user role assignment
    
    This action is IRREVERSIBLE.
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    # Prevent admin from deleting themselves
    if user_id == admin.user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete your own admin account"
        )
    
    user = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting other admins (optional security measure)
    if user.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete another admin. Demote to user first."
        )
    
    # Get user's workspaces
    workspaces = db.query(Workspace).filter(
        Workspace.owner_id == user_uuid
    ).all()
    
    deleted_workspaces = len(workspaces)
    
    # Delete all workspaces (cascade will handle related data)
    for ws in workspaces:
        db.delete(ws)
    
    # Delete user role
    db.delete(user)
    
    db.commit()
    
    # Log admin action
    log_admin_action(
        db, admin.user_id, "DELETE_USER",
        target_type="user",
        target_id=user_id,
        details=f"Deleted user {user.email} with {deleted_workspaces} workspaces"
    )
    
    return {
        "success": True,
        "message": f"User deleted successfully",
        "deleted_workspaces": deleted_workspaces
    }


@router.get("/users/{user_id}/workspaces")
async def list_user_workspaces(
    user_id: str,
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    List all workspaces for a specific user.
    Admin only, READ-ONLY.
    """
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    
    # Verify user exists
    user = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    workspaces = db.query(Workspace).filter(
        Workspace.owner_id == user_uuid
    ).order_by(Workspace.created_at.desc()).all()
    
    result = []
    for ws in workspaces:
        dataset = db.query(WorkspaceDataset).filter(
            WorkspaceDataset.workspace_id == ws.id,
            WorkspaceDataset.is_active == True
        ).first()
        
        kpi_count = db.query(CustomKPI).filter(
            CustomKPI.workspace_id == ws.id
        ).count()
        
        result.append({
            "id": str(ws.id),
            "name": ws.name,
            "description": ws.description,
            "data_type": ws.data_type.value,
            "status": ws.status.value,
            "has_data": dataset is not None,
            "supplier_count": len(dataset.suppliers) if dataset and dataset.suppliers else 0,
            "order_count": dataset.row_count if dataset else 0,
            "custom_kpi_count": kpi_count,
            "created_at": ws.created_at.isoformat() if ws.created_at else None,
            "updated_at": ws.updated_at.isoformat() if ws.updated_at else None
        })
    
    # Log admin action
    log_admin_action(
        db, admin.user_id, "LIST_USER_WORKSPACES",
        target_type="user",
        target_id=user_id,
        details=f"Listed {len(result)} workspaces"
    )
    
    return {
        "user_id": user_id,
        "user_email": user.email,
        "workspaces": result
    }


@router.get("/users/{user_id}/workspaces/{workspace_id}/dashboard")
async def view_user_workspace_dashboard(
    user_id: str,
    workspace_id: str,
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    View a user's workspace dashboard data.
    Admin only, READ-ONLY.
    
    Returns the same data as the user would see, but marked as admin view.
    """
    import pandas as pd
    from backend.mon_analyse import (
        calculer_kpis_globaux,
        calculer_risques_fournisseurs,
        obtenir_actions_recommandees,
        calculer_predictions_avancees,
        calculer_distribution_risques
    )
    from backend.workspace_routes import get_workspace_dataframe, get_schema_for_case
    
    try:
        user_uuid = uuid.UUID(user_id)
        workspace_uuid = uuid.UUID(workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")
    
    # Verify user exists
    user = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify workspace exists and belongs to user
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_uuid
    ).first()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    # Security check: workspace must belong to the specified user
    if workspace.owner_id and workspace.owner_id != user_uuid:
        raise HTTPException(
            status_code=403,
            detail="Workspace does not belong to this user"
        )
    
    # Get workspace data
    df = get_workspace_dataframe(workspace_uuid, db)
    
    if df is None or df.empty:
        return {
            "admin_view": True,
            "read_only": True,
            "user_id": user_id,
            "user_email": user.email,
            "workspace": {
                "id": str(workspace.id),
                "name": workspace.name,
                "data_type": workspace.data_type.value,
                "has_data": False
            },
            "message": "Workspace has no data"
        }
    
    # Calculate KPIs (same as user would see)
    kpis = calculer_kpis_globaux(df)
    risques = calculer_risques_fournisseurs(df)
    actions = obtenir_actions_recommandees(risques)
    predictions = calculer_predictions_avancees(df, fenetre=3)
    distribution = calculer_distribution_risques(risques)
    
    # Get custom KPIs
    custom_kpis = db.query(CustomKPI).filter(
        CustomKPI.workspace_id == workspace_uuid,
        CustomKPI.is_enabled == True
    ).all()
    
    custom_kpi_values = {}
    for kpi in custom_kpis:
        if kpi.target_field and kpi.target_field in df.columns:
            if kpi.formula_type == "average":
                value = df[kpi.target_field].mean()
            elif kpi.formula_type == "sum":
                value = df[kpi.target_field].sum()
            elif kpi.formula_type == "percentage":
                value = (df[kpi.target_field] > 0).mean() * 100
            else:
                value = df[kpi.target_field].mean()
            custom_kpi_values[kpi.name] = round(value, kpi.decimal_places)
    
    schema = get_schema_for_case(workspace.data_type)
    
    # Log admin action
    log_admin_action(
        db, admin.user_id, "VIEW_USER_WORKSPACE_DASHBOARD",
        target_type="workspace",
        target_id=workspace_id,
        details=f"Viewed dashboard for user {user.email}"
    )
    
    return {
        # Admin view markers
        "admin_view": True,
        "read_only": True,
        
        # User info
        "user_id": user_id,
        "user_email": user.email,
        
        # Workspace info
        "workspace": {
            "id": str(workspace.id),
            "name": workspace.name,
            "description": workspace.description,
            "data_type": workspace.data_type.value,
            "status": workspace.status.value,
            "has_data": True
        },
        
        # Dashboard data (READ-ONLY)
        "data_type": workspace.data_type.value,
        "case_type": schema.get("case_type", "mixed"),
        "case_description": schema.get("description", ""),
        "kpis_globaux": kpis,
        "custom_kpis": custom_kpi_values,
        "suppliers": risques,
        "actions": actions,
        "predictions": predictions,
        "distribution": distribution
    }


@router.post("/users")
async def create_user(
    request: UserCreateRequest,
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new user.
    Admin only.
    
    Note: This creates the user role entry. The actual Supabase auth user
    should be created via Supabase Admin API or through normal registration.
    """
    # Check if email already exists
    existing = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.email == request.email
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists"
        )
    
    # Generate a new user ID (in production, this would come from Supabase)
    new_user_id = uuid.uuid4()
    
    # Validate role
    try:
        role = UserRole(request.role)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid role. Must be 'user' or 'admin'"
        )
    
    # Create user role entry
    new_user = UserRoleAssignment(
        user_id=new_user_id,
        email=request.email,
        display_name=request.display_name,
        role=role,
        assigned_by=uuid.UUID(admin.user_id)
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Log admin action
    log_admin_action(
        db, admin.user_id, "CREATE_USER",
        target_type="user",
        target_id=str(new_user_id),
        details=f"Created user {request.email} with role {request.role}"
    )
    
    return {
        "success": True,
        "user": {
            "id": str(new_user.user_id),
            "email": new_user.email,
            "display_name": new_user.display_name,
            "role": new_user.role.value,
            "created_at": new_user.created_at.isoformat()
        },
        "message": f"User created successfully. Note: Supabase auth user should be created separately."
    }


@router.get("/audit-log")
async def get_audit_log(
    limit: int = 100,
    admin: AdminUserInfo = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Get admin audit log.
    Admin only.
    """
    logs = db.query(AdminAuditLog).order_by(
        AdminAuditLog.created_at.desc()
    ).limit(limit).all()
    
    return {
        "logs": [
            {
                "id": str(log.id),
                "admin_user_id": str(log.admin_user_id),
                "action": log.action,
                "target_type": log.target_type,
                "target_id": str(log.target_id) if log.target_id else None,
                "details": log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat()
            }
            for log in logs
        ]
    }


@router.get("/check-role")
async def check_admin_role(
    x_admin_user_id: Optional[str] = Header(None, alias="X-Admin-User-ID"),
    db: Session = Depends(get_db)
):
    """
    Check if a user has admin role.
    Used by frontend to determine if admin UI should be shown.
    """
    if not x_admin_user_id:
        return {"is_admin": False, "reason": "No user ID provided"}
    
    try:
        user_uuid = uuid.UUID(x_admin_user_id)
    except ValueError:
        return {"is_admin": False, "reason": "Invalid user ID format"}
    
    user_role = db.query(UserRoleAssignment).filter(
        UserRoleAssignment.user_id == user_uuid
    ).first()
    
    if not user_role:
        return {"is_admin": False, "reason": "User not found"}
    
    return {
        "is_admin": user_role.role == UserRole.ADMIN,
        "role": user_role.role.value,
        "is_active": user_role.is_active,
        "email": user_role.email
    }
