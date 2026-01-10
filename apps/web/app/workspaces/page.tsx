'use client';
/**
 * Workspaces Page
 * 
 * Entry point for workspace-based supplier analysis.
 * Allows users to manage workspaces and navigate to individual workspace views.
 */

import { useState } from 'react';
import WorkspaceDashboard from '~/components/WorkspaceDashboard';
import WorkspaceView from '~/components/WorkspaceView';

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function WorkspacesPage() {
  // Track whether user is viewing workspace list or a specific workspace
  const [activeWorkspace, setActiveWorkspace] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Handle workspace selection from dashboard
  const handleSelectWorkspace = (workspaceId: string, workspaceName: string) => {
    setActiveWorkspace({ id: workspaceId, name: workspaceName });
  };

  // Handle back navigation from workspace view
  const handleBack = () => {
    setActiveWorkspace(null);
  };

  // Render workspace view if a workspace is selected
  if (activeWorkspace) {
    return (
      <WorkspaceView
        workspaceId={activeWorkspace.id}
        workspaceName={activeWorkspace.name}
        onBack={handleBack}
      />
    );
  }

  // Otherwise render the workspace dashboard (list)
  return <WorkspaceDashboard onSelectWorkspace={handleSelectWorkspace} />;
}
