# workspace_models.py
"""
SQLAlchemy models for Workspace-based data management.
Supports multiple data types (Cases A, B, C) and custom KPIs.
"""

import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, Enum as SQLEnum, JSON, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

# Try both import paths for flexibility
try:
    from backend.database import Base
except ImportError:
    from database import Base


# ============================================
# ENUMS FOR DATA TYPES
# ============================================

class DataTypeCase(str, Enum):
    """
    Data type cases for different prediction scenarios:
    - CASE_A: Delays format (supplier, date_promised, date_delivered, defects)
    - CASE_B: Late Days format (supplier, order_date, expected_days, actual_days, quality_score)
    - CASE_C: Mixed format (combines both delay and quality metrics)
    """
    CASE_A = "delays"      # Original format: delay predictions
    CASE_B = "late_days"   # Late days format: late-day predictions
    CASE_C = "mixed"       # Combined format: both metrics


class WorkspaceStatus(str, Enum):
    """Workspace status states"""
    ACTIVE = "active"
    ARCHIVED = "archived"
    PENDING = "pending"


# ============================================
# WORKSPACE MODEL
# ============================================

class Workspace(Base):
    """
    Workspace model - each workspace contains its own dataset and settings.
    Users can create multiple workspaces for different analysis scenarios.
    """
    __tablename__ = "workspaces"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Data type case determines how data is validated and processed
    data_type = Column(SQLEnum(DataTypeCase), default=DataTypeCase.CASE_A, nullable=False)
    status = Column(SQLEnum(WorkspaceStatus), default=WorkspaceStatus.ACTIVE)
    
    # Owner reference - links to users table
    owner_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    datasets = relationship("WorkspaceDataset", back_populates="workspace", cascade="all, delete-orphan")
    custom_kpis = relationship("CustomKPI", back_populates="workspace", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Workspace(id={self.id}, name='{self.name}', type={self.data_type})>"


# ============================================
# WORKSPACE DATASET MODEL
# ============================================

class WorkspaceDataset(Base):
    """
    Stores uploaded dataset information for each workspace.
    The actual data is stored as JSON for flexibility.
    """
    __tablename__ = "workspace_datasets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    
    # Dataset metadata
    filename = Column(String(255), nullable=False)
    row_count = Column(Integer, default=0)
    column_count = Column(Integer, default=0)
    
    # Supplier list extracted from data
    suppliers = Column(JSON, default=list)
    
    # Date range of the data
    date_start = Column(DateTime(timezone=True), nullable=True)
    date_end = Column(DateTime(timezone=True), nullable=True)
    
    # The processed data stored as JSON (for smaller datasets)
    # For larger datasets, consider using a separate table or file storage
    data_json = Column(JSON, nullable=True)
    
    # Upload info
    uploaded_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # Relationship
    workspace = relationship("Workspace", back_populates="datasets")
    
    def __repr__(self):
        return f"<WorkspaceDataset(id={self.id}, filename='{self.filename}')>"


# ============================================
# CUSTOM KPI MODEL
# ============================================

class CustomKPI(Base):
    """
    User-defined custom KPIs for a workspace.
    Allows users to define additional metrics beyond standard KPIs.
    
    Supports two modes:
    1. Simple mode: formula_type is 'average', 'sum', or 'percentage' with target_field
    2. Expression mode: formula_type is 'expression' with custom formula in 'formula' field
    
    Expression mode allows mathematical formulas using predefined variables like:
    - delay, defect_rate, risk_score, conformity_rate, etc.
    - Operators: +, -, *, /, **, ()
    - Example: (delay / defect_rate) * 100
    """
    __tablename__ = "custom_kpis"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    
    # KPI definition
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Formula type: 'average', 'sum', 'percentage', 'expression'
    # 'expression' enables custom formula evaluation
    formula_type = Column(String(50), default="average")
    
    # Custom formula expression (when formula_type='expression')
    # Example: "(delay / defect_rate) * 100"
    # Only used when formula_type is 'expression'
    formula = Column(Text, nullable=True)
    
    # Variables used in the formula (stored for quick reference)
    # Example: ["delay", "defect_rate"]
    formula_variables = Column(JSON, default=list)
    
    # Field to calculate on (e.g., 'defects', 'delay')
    # Used for simple formula types (average, sum, percentage)
    target_field = Column(String(50), nullable=True)
    
    # Optional threshold for alerts
    threshold_warning = Column(Float, nullable=True)
    threshold_critical = Column(Float, nullable=True)
    
    # Display settings
    unit = Column(String(20), default="%")
    decimal_places = Column(Integer, default=2)
    
    # Is this KPI enabled?
    is_enabled = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationship
    workspace = relationship("Workspace", back_populates="custom_kpis")
    
    def __repr__(self):
        return f"<CustomKPI(id={self.id}, name='{self.name}')>"


# ============================================
# MODEL SELECTION TRACKING
# ============================================

class ModelSelection(Base):
    """
    Tracks which ML model is currently selected for each workspace.
    Allows users to switch between models without affecting data.
    """
    __tablename__ = "model_selections"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False)
    
    # Available models: 'moving_average', 'linear_regression', 'exponential', 'combined'
    selected_model = Column(String(50), default="combined")
    
    # Model parameters (stored as JSON for flexibility)
    parameters = Column(JSON, default=dict)
    
    # Last run timestamp
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    
    # Cached results (optional - for performance)
    cached_results = Column(JSON, nullable=True)
    
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<ModelSelection(workspace_id={self.workspace_id}, model='{self.selected_model}')>"
