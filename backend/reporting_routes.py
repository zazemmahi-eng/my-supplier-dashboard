# reporting_routes.py
"""
FastAPI routes for reporting and export functionality.
Supports PDF and Excel export with filtering by supplier.
"""

import io
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd

from backend.database import get_db
from backend.workspace_models import Workspace, WorkspaceDataset, CustomKPI
from backend.workspace_routes import get_workspace_dataframe
from backend.mon_analyse import (
    calculer_kpis_globaux,
    calculer_risques_fournisseurs,
    obtenir_actions_recommandees,
    calculer_predictions_avancees
)

# ============================================
# ROUTER CONFIGURATION
# ============================================

router = APIRouter(prefix="/api/reports", tags=["reports"])

# ============================================
# HELPER FUNCTIONS
# ============================================

def generate_report_data(
    workspace_id: uuid.UUID,
    db: Session,
    supplier_filter: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate report data for a workspace, optionally filtered by supplier.
    Uses EXISTING model functions without modification.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    df = get_workspace_dataframe(workspace_id, db)
    if df is None or df.empty:
        raise HTTPException(status_code=400, detail="Aucune donnée disponible")
    
    # Filter by supplier if specified
    if supplier_filter and supplier_filter != "all":
        df = df[df["supplier"] == supplier_filter].copy()
        if df.empty:
            raise HTTPException(status_code=404, detail=f"Fournisseur '{supplier_filter}' non trouvé")
    
    # Use EXISTING model functions
    kpis = calculer_kpis_globaux(df)
    risques = calculer_risques_fournisseurs(df)
    actions = obtenir_actions_recommandees(risques)
    predictions = calculer_predictions_avancees(df, fenetre=3)
    
    # Get custom KPIs
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
        "workspace_name": workspace.name,
        "data_type": workspace.data_type.value,
        "generated_at": datetime.now().isoformat(),
        "filter": supplier_filter or "all",
        "kpis": kpis,
        "custom_kpis": custom_kpi_values,
        "suppliers": risques,
        "actions": actions,
        "predictions": predictions,
        "raw_data": df.to_dict(orient='records')
    }


# ============================================
# EXCEL EXPORT
# ============================================

@router.get("/{workspace_id}/export/excel")
async def export_excel(
    workspace_id: uuid.UUID,
    supplier: Optional[str] = Query(None, description="Filter by supplier name, or 'all' for all suppliers"),
    db: Session = Depends(get_db)
):
    """
    Export workspace report as Excel file.
    Creates multiple sheets: Summary, Suppliers, Predictions, Actions, Raw Data.
    
    Returns:
        StreamingResponse: Excel file download
    
    Raises:
        HTTPException 404: Workspace not found
        HTTPException 400: No data available for export
        HTTPException 500: Export error (openpyxl missing or generation error)
    """
    # Pre-check: Verify openpyxl is installed before processing
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Le module openpyxl n'est pas installé. Exécutez: pip install openpyxl"
        )
    
    try:
        report_data = generate_report_data(workspace_id, db, supplier)
        
        # Create Excel file in memory
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Sheet 1: Summary (KPIs)
            kpis_df = pd.DataFrame([report_data["kpis"]])
            kpis_df.to_excel(writer, sheet_name='Résumé KPIs', index=False)
            
            # Add custom KPIs to summary
            if report_data["custom_kpis"]:
                custom_df = pd.DataFrame([report_data["custom_kpis"]])
                # Append below KPIs with spacing
                startrow = len(kpis_df) + 3
                custom_df.to_excel(writer, sheet_name='Résumé KPIs', index=False, startrow=startrow)
            
            # Sheet 2: Suppliers Risk Analysis
            if report_data["suppliers"]:
                suppliers_df = pd.DataFrame(report_data["suppliers"])
                # Rename columns for better readability
                column_mapping = {
                    "supplier": "Fournisseur",
                    "score_risque": "Score Risque",
                    "niveau_risque": "Niveau Risque",
                    "retard_moyen": "Retard Moyen (j)",
                    "taux_defaut": "Taux Défaut (%)",
                    "taux_retard": "Taux Retard (%)",
                    "nb_commandes": "Nb Commandes",
                    "tendance_defauts": "Tendance Défauts",
                    "tendance_retards": "Tendance Retards"
                }
                suppliers_df = suppliers_df.rename(columns=column_mapping)
                suppliers_df.to_excel(writer, sheet_name='Analyse Fournisseurs', index=False)
            
            # Sheet 3: Predictions
            if report_data["predictions"]:
                predictions_df = pd.DataFrame(report_data["predictions"])
                column_mapping = {
                    "supplier": "Fournisseur",
                    "predicted_defect": "Défauts Prédits (%)",
                    "predicted_delay": "Retard Prédit (j)",
                    "method_ma_defect": "Moy. Glissante - Défauts",
                    "method_ma_delay": "Moy. Glissante - Retard",
                    "method_lr_defect": "Régression - Défauts",
                    "method_lr_delay": "Régression - Retard",
                    "method_exp_defect": "Exponentielle - Défauts",
                    "method_exp_delay": "Exponentielle - Retard",
                    "confiance": "Niveau Confiance"
                }
                predictions_df = predictions_df.rename(columns=column_mapping)
                predictions_df.to_excel(writer, sheet_name='Prédictions', index=False)
            
            # Sheet 4: Actions
            if report_data["actions"]:
                actions_df = pd.DataFrame(report_data["actions"])
                column_mapping = {
                    "supplier": "Fournisseur",
                    "action": "Action Recommandée",
                    "priority": "Priorité",
                    "raison": "Raison",
                    "delai": "Délai",
                    "impact": "Impact"
                }
                actions_df = actions_df.rename(columns=column_mapping)
                actions_df.to_excel(writer, sheet_name='Actions Recommandées', index=False)
            
            # Sheet 5: Raw Data
            if report_data["raw_data"]:
                raw_df = pd.DataFrame(report_data["raw_data"])
                raw_df.to_excel(writer, sheet_name='Données Brutes', index=False)
        
        output.seek(0)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        supplier_suffix = f"_{supplier}" if supplier and supplier != "all" else ""
        filename = f"rapport_{report_data['workspace_name']}{supplier_suffix}_{timestamp}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except ImportError as ie:
        # More specific error for missing dependencies
        raise HTTPException(
            status_code=500,
            detail=f"Module manquant pour l'export Excel: {str(ie)}. Exécutez: pip install openpyxl"
        )
    except ValueError as ve:
        # Data validation errors
        raise HTTPException(status_code=400, detail=f"Erreur de données: {str(ve)}")
    except Exception as e:
        # Log the error for debugging (in production, use proper logging)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur d'export Excel: {str(e)}")


# ============================================
# PDF EXPORT
# ============================================

@router.get("/{workspace_id}/export/pdf")
async def export_pdf(
    workspace_id: uuid.UUID,
    supplier: Optional[str] = Query(None, description="Filter by supplier name"),
    db: Session = Depends(get_db)
):
    """
    Export workspace report as PDF file.
    Uses reportlab for PDF generation.
    
    Returns:
        StreamingResponse: PDF file download
    
    Raises:
        HTTPException 404: Workspace not found
        HTTPException 400: No data available for export
        HTTPException 500: Export error (reportlab missing or generation error)
    """
    # Pre-check: Verify reportlab is installed before processing
    try:
        import reportlab  # noqa: F401
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Le module reportlab n'est pas installé. Exécutez: pip install reportlab"
        )
    
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch, cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        
        report_data = generate_report_data(workspace_id, db, supplier)
        
        # Create PDF in memory
        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=A4, topMargin=1*cm, bottomMargin=1*cm)
        
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=20,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1e40af')
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            spaceBefore=15,
            spaceAfter=10,
            textColor=colors.HexColor('#1e3a8a')
        )
        
        # Title
        title = f"Rapport d'Analyse - {report_data['workspace_name']}"
        elements.append(Paragraph(title, title_style))
        
        # Metadata
        meta_text = f"Généré le: {datetime.now().strftime('%d/%m/%Y à %H:%M')}"
        if supplier and supplier != "all":
            meta_text += f" | Filtre: {supplier}"
        elements.append(Paragraph(meta_text, styles['Normal']))
        elements.append(Spacer(1, 20))
        
        # KPIs Section
        elements.append(Paragraph("Indicateurs Cles (KPIs)", heading_style))
        
        kpis = report_data["kpis"]
        kpi_data = [
            ["Indicateur", "Valeur"],
            ["Taux de Retard", f"{kpis.get('taux_retard', 0):.2f}%"],
            ["Taux de Défaut", f"{kpis.get('taux_defaut', 0):.2f}%"],
            ["Retard Moyen", f"{kpis.get('retard_moyen', 0):.1f} jours"],
            ["Nombre de Commandes", str(kpis.get('nb_commandes', 0))],
            ["Taux de Conformité", f"{kpis.get('taux_conformite', 0):.2f}%"],
            ["Commandes Parfaites", str(kpis.get('commandes_parfaites', 0))]
        ]
        
        # Add custom KPIs
        for name, value in report_data.get("custom_kpis", {}).items():
            kpi_data.append([name, str(value)])
        
        kpi_table = Table(kpi_data, colWidths=[3.5*inch, 2*inch])
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8fafc')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f1f5f9')])
        ]))
        elements.append(kpi_table)
        elements.append(Spacer(1, 20))
        
        # Suppliers Section
        if report_data["suppliers"]:
            elements.append(Paragraph("Analyse des Fournisseurs", heading_style))
            
            supplier_data = [["Fournisseur", "Score", "Niveau", "Retard Moy.", "Défaut %"]]
            for s in report_data["suppliers"][:10]:  # Limit to 10 for PDF
                supplier_data.append([
                    s.get("supplier", "")[:20],
                    f"{s.get('score_risque', 0):.1f}",
                    s.get("niveau_risque", ""),
                    f"{s.get('retard_moyen', 0):.1f}j",
                    f"{s.get('taux_defaut', 0):.2f}%"
                ])
            
            supplier_table = Table(supplier_data, colWidths=[2*inch, 0.8*inch, 1*inch, 1*inch, 1*inch])
            supplier_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0fdf4')])
            ]))
            elements.append(supplier_table)
            elements.append(Spacer(1, 20))
        
        # Predictions Section
        if report_data["predictions"]:
            elements.append(Paragraph("Predictions", heading_style))
            
            pred_data = [["Fournisseur", "Défauts Prédits", "Retard Prédit", "Confiance"]]
            for p in report_data["predictions"][:10]:
                pred_data.append([
                    p.get("supplier", "")[:20],
                    f"{p.get('predicted_defect', 0):.2f}%",
                    f"{p.get('predicted_delay', 0):.1f}j",
                    p.get("confiance", "")
                ])
            
            pred_table = Table(pred_data, colWidths=[2*inch, 1.3*inch, 1.3*inch, 1.2*inch])
            pred_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8b5cf6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#faf5ff')])
            ]))
            elements.append(pred_table)
            elements.append(Spacer(1, 20))
        
        # Actions Section
        if report_data["actions"]:
            elements.append(Paragraph("Actions Recommandees", heading_style))
            
            # Group by priority
            high_actions = [a for a in report_data["actions"] if a.get("priority") == "high"]
            medium_actions = [a for a in report_data["actions"] if a.get("priority") == "medium"]
            
            if high_actions:
                elements.append(Paragraph("[HAUTE PRIORITE]", styles['Normal']))
                for a in high_actions[:5]:
                    action_text = f"- {a.get('supplier', '')}: {a.get('action', '')} - {a.get('raison', '')}"
                    elements.append(Paragraph(action_text, styles['Normal']))
                elements.append(Spacer(1, 10))
            
            if medium_actions:
                elements.append(Paragraph("[PRIORITE MOYENNE]", styles['Normal']))
                for a in medium_actions[:5]:
                    action_text = f"- {a.get('supplier', '')}: {a.get('action', '')} - {a.get('raison', '')}"
                    elements.append(Paragraph(action_text, styles['Normal']))
        
        # Build PDF
        doc.build(elements)
        output.seek(0)
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        supplier_suffix = f"_{supplier}" if supplier and supplier != "all" else ""
        filename = f"rapport_{report_data['workspace_name']}{supplier_suffix}_{timestamp}.pdf"
        
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except ImportError as ie:
        # More specific error for missing dependencies
        raise HTTPException(
            status_code=500,
            detail=f"Module manquant pour l'export PDF: {str(ie)}. Exécutez: pip install reportlab"
        )
    except ValueError as ve:
        # Data validation errors
        raise HTTPException(status_code=400, detail=f"Erreur de données: {str(ve)}")
    except Exception as e:
        # Log the error for debugging (in production, use proper logging)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur d'export PDF: {str(e)}")


# ============================================
# REPORT PREVIEW
# ============================================

@router.get("/{workspace_id}/preview")
async def preview_report(
    workspace_id: uuid.UUID,
    supplier: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get a preview of report data without generating a file.
    Useful for displaying in the UI before export.
    """
    try:
        report_data = generate_report_data(workspace_id, db, supplier)
        
        # Return summarized data for preview
        return {
            "workspace_name": report_data["workspace_name"],
            "generated_at": report_data["generated_at"],
            "filter": report_data["filter"],
            "summary": {
                "total_kpis": len(report_data["kpis"]) + len(report_data.get("custom_kpis", {})),
                "total_suppliers": len(report_data["suppliers"]),
                "total_predictions": len(report_data["predictions"]),
                "total_actions": len(report_data["actions"]),
                "total_rows": len(report_data["raw_data"])
            },
            "kpis": report_data["kpis"],
            "custom_kpis": report_data.get("custom_kpis", {}),
            "suppliers": report_data["suppliers"],
            "predictions": report_data["predictions"],
            "actions": report_data["actions"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SUPPLIER LIST FOR FILTERING
# ============================================

@router.get("/{workspace_id}/suppliers")
async def get_suppliers_for_filter(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """
    Get list of suppliers for filter dropdown.
    """
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace non trouvé")
    
    dataset = db.query(WorkspaceDataset).filter(
        WorkspaceDataset.workspace_id == workspace_id,
        WorkspaceDataset.is_active == True
    ).first()
    
    if not dataset:
        return {"suppliers": []}
    
    return {
        "suppliers": dataset.suppliers or []
    }
