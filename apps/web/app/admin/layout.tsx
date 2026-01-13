'use client';
/**
 * Admin Layout
 * 
 * SECURITY FLOW:
 * 1. Check if user is authenticated via Supabase
 * 2. Verify admin role via backend API
 * 3. If not admin → redirect to /dashboard with "Access denied"
 * 4. Store admin credentials in localStorage for API calls
 * 
 * VISUAL ELEMENTS:
 * - ADMIN MODE badge in header
 * - Clear visual distinction from user interface
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSupabase } from '@kit/supabase/hooks/use-supabase';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import {
  Shield, LogOut, Home, Users, Settings, Activity,
  AlertTriangle, Lock, Menu, X
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

interface AdminLayoutProps {
  children: React.ReactNode;
}

interface AdminUser {
  id: string;
  email: string;
  displayName?: string;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Use Supabase hooks
  const supabase = useSupabase();
  const signOutMutation = useSignOut();
  
  // Verify admin access
  const verifyAdminAccess = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 1. Check Supabase authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        // Not authenticated → redirect to login
        router.push('/auth/sign-in?next=/admin');
        return;
      }
      
      // 2. Verify admin role via backend
      const response = await fetch(
        `${API_BASE_URL}/api/admin/check-user-role?user_id=${user.id}`,
        { cache: 'no-store' }
      );
      
      if (!response.ok) {
        throw new Error('Failed to verify admin role');
      }
      
      const roleData = await response.json();
      
      if (!roleData.is_admin) {
        // Not admin → redirect to dashboard with error
        setError('Access denied. Admin privileges required.');
        
        // Clear any stored admin credentials
        localStorage.removeItem('admin_user_id');
        localStorage.removeItem('admin_email');
        localStorage.removeItem('admin_display_name');
        
        // Redirect after showing error
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
        return;
      }
      
      // 3. Store admin credentials for API calls
      localStorage.setItem('admin_user_id', user.id);
      localStorage.setItem('admin_email', user.email || '');
      localStorage.setItem('admin_display_name', roleData.display_name || '');
      
      setAdminUser({
        id: user.id,
        email: user.email || '',
        displayName: roleData.display_name
      });
      
      setIsVerified(true);
      
    } catch (err) {
      console.error('Admin verification failed:', err);
      setError('Failed to verify admin access');
      
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, router]);
  
  useEffect(() => {
    verifyAdminAccess();
  }, [verifyAdminAccess]);
  
  // Handle logout
  const handleLogout = async () => {
    localStorage.removeItem('admin_user_id');
    localStorage.removeItem('admin_email');
    localStorage.removeItem('admin_display_name');
    
    signOutMutation.mutate();
    router.push('/auth/sign-in');
  };
  
  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Verifying admin access...</p>
        </div>
      </div>
    );
  }
  
  // Error / Access denied state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-red-500/50">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }
  
  // Not verified yet
  if (!isVerified || !adminUser) {
    return null;
  }
  
  // Admin verified - render layout
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Admin Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-purple-900 via-gray-900 to-purple-900 border-b border-purple-700/50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo & Admin Badge */}
            <div className="flex items-center gap-4">
              <Link href="/admin" className="flex items-center gap-3">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold text-lg hidden sm:block">Admin Panel</span>
              </Link>
              
              {/* Admin Mode Badge */}
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center gap-1.5 animate-pulse">
                  <Lock className="h-3 w-3" />
                  ADMIN MODE
                </span>
              </div>
            </div>
            
            {/* Center: Navigation (Desktop) */}
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/admin"
                className="px-4 py-2 rounded-lg hover:bg-purple-800/50 transition-colors flex items-center gap-2 text-sm"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/admin#users"
                className="px-4 py-2 rounded-lg hover:bg-purple-800/50 transition-colors flex items-center gap-2 text-sm"
              >
                <Users className="h-4 w-4" />
                Users
              </Link>
              <Link
                href="/admin#audit"
                className="px-4 py-2 rounded-lg hover:bg-purple-800/50 transition-colors flex items-center gap-2 text-sm"
              >
                <Activity className="h-4 w-4" />
                Audit Log
              </Link>
            </nav>
            
            {/* Right: User Info & Logout */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium">{adminUser.displayName || 'Admin'}</p>
                <p className="text-xs text-gray-400">{adminUser.email}</p>
              </div>
              
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-red-600/20 rounded-lg transition-colors text-red-400 hover:text-red-300"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </button>
              
              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 hover:bg-purple-800/50 rounded-lg"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-purple-700/50 bg-gray-900/95 backdrop-blur">
            <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg hover:bg-purple-800/50 transition-colors flex items-center gap-3"
              >
                <Home className="h-5 w-5" />
                Dashboard
              </Link>
              <Link
                href="/admin#users"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg hover:bg-purple-800/50 transition-colors flex items-center gap-3"
              >
                <Users className="h-5 w-5" />
                Users
              </Link>
              <Link
                href="/admin#audit"
                onClick={() => setMobileMenuOpen(false)}
                className="px-4 py-3 rounded-lg hover:bg-purple-800/50 transition-colors flex items-center gap-3"
              >
                <Activity className="h-5 w-5" />
                Audit Log
              </Link>
            </nav>
          </div>
        )}
      </header>
      
      {/* Security Banner */}
      <div className="bg-yellow-900/30 border-b border-yellow-700/50">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center justify-center gap-2 text-yellow-400 text-xs">
            <Shield className="h-3.5 w-3.5" />
            <span>
              Administrative access • All actions are logged • Read-only access to user data
            </span>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <main>
        {children}
      </main>
      
      {/* Admin Footer */}
      <footer className="border-t border-gray-700 bg-gray-800/50 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Admin Panel • My Supplier Dashboard</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Secure Session • {adminUser.email}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
