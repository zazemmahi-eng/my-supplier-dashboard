'use client';
/**
 * Workspaces Page
 * 
 * Entry point for workspace-based supplier analysis.
 * Allows users to manage workspaces and navigate to individual workspace views.
 * 
 * URL Parameters:
 * - ?open=<workspaceId> : Opens the specified workspace directly
 * - ?create=true : Opens the create workspace modal
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import WorkspaceDashboard from '~/components/WorkspaceDashboard';
import WorkspaceView from '~/components/WorkspaceView';

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function WorkspacesPage() {
  const searchParams = useSearchParams();
  
  // Track whether user is viewing workspace list or a specific workspace
  const [activeWorkspace, setActiveWorkspace] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Handle URL parameters on mount
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      // We'll set a placeholder name until the workspace loads
      setActiveWorkspace({ id: openId, name: 'Loading...' });
    }
  }, [searchParams]);

  // Handle workspace selection from dashboard
  const handleSelectWorkspace = (workspaceId: string, workspaceName: string) => {
    setActiveWorkspace({ id: workspaceId, name: workspaceName });
    // Update URL without full page reload
    window.history.pushState({}, '', `/workspaces?open=${workspaceId}`);
  };

  // Handle back navigation from workspace view
  const handleBack = () => {
    setActiveWorkspace(null);
    // Clear URL parameters
    window.history.pushState({}, '', '/workspaces');
  };

  // Render workspace view if a workspace is selected
  if (activeWorkspace) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Top Navigation Bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="font-medium">Retour aux Workspaces</span>
                </button>
              </div>
              <Link href="/dashboard">
                <button className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard Global
                </button>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Workspace View */}
        <WorkspaceView
          workspaceId={activeWorkspace.id}
          workspaceName={activeWorkspace.name}
          onBack={handleBack}
        />
      </div>
    );
  }

  // Otherwise render the workspace dashboard (list)
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard">
              <button className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
                <ArrowLeft className="h-5 w-5" />
                <span className="font-medium">Dashboard Global</span>
              </button>
            </Link>
          </div>
        </div>
      </div>
      
      {/* Workspace Dashboard */}
      <WorkspaceDashboard onSelectWorkspace={handleSelectWorkspace} />
    </div>
  );
}
