'use client';
/**
 * Admin Dashboard Page
 * 
 * Global admin view for managing the application:
 * - Global statistics (users, workspaces, suppliers)
 * - User management (list, view, delete)
 * - Read-only access to any user's dashboard
 * 
 * ADMIN MODE is clearly indicated throughout the UI.
 * All actions are READ-ONLY except for user management.
 * 
 * NOTE: Authentication is handled by the parent layout.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import {
  Users, FolderOpen, Package, BarChart3, Shield, Eye, Trash2,
  AlertTriangle, CheckCircle, Clock, Activity, RefreshCw,
  ChevronRight, Search, Filter, Download, UserPlus, Settings,
  Lock, Database, TrendingUp, PieChart as PieChartIcon
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from 'recharts';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

// ============================================
// TYPES
// ============================================

interface AdminStats {
  total_users: number;
  total_workspaces: number;
  workspaces_per_user: number;
  total_suppliers: number;
  workspace_types: {
    delays: number;
    late_days: number;
    mixed: number;
  };
  active_users: number;
}

interface UserItem {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  workspace_count: number;
  supplier_count: number;
  created_at: string;
  is_active: boolean;
}

interface UserDetails {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    is_active: boolean;
    created_at: string;
  };
  stats: {
    workspace_count: number;
    total_suppliers: number;
    total_orders: number;
  };
  workspaces: Array<{
    id: string;
    name: string;
    data_type: string;
    status: string;
    supplier_count: number;
    order_count: number;
    has_data: boolean;
    created_at: string;
  }>;
}

interface AuditLogItem {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

// ============================================
// COLORS
// ============================================

const COLORS = {
  primary: '#7c3aed',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  delays: '#3b82f6',
  late_days: '#8b5cf6',
  mixed: '#10b981'
};

// ============================================
// ADMIN DASHBOARD COMPONENT
// ============================================

export default function AdminDashboard() {
  const router = useRouter();
  
  // Auth state - credentials from layout via localStorage
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  
  // Data state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserDetails | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'audit'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // ============================================
  // LOAD ADMIN CREDENTIALS (set by layout.tsx)
  // ============================================
  
  useEffect(() => {
    // Layout.tsx handles auth and stores credentials in localStorage
    const storedUserId = localStorage.getItem('admin_user_id');
    const storedEmail = localStorage.getItem('admin_email');
    
    if (storedUserId && storedEmail) {
      setAdminUserId(storedUserId);
      setAdminEmail(storedEmail);
    }
  }, []);
  
  // ============================================
  // API HEADERS
  // ============================================
  
  const getHeaders = useCallback(() => ({
    'X-Admin-User-ID': adminUserId || '',
    'X-Admin-Email': adminEmail || ''
  }), [adminUserId, adminEmail]);
  
  // ============================================
  // FETCH DATA
  // ============================================
  
  const fetchStats = useCallback(async () => {
    if (!adminUserId) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/stats`, {
        headers: getHeaders()
      });
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setError('Failed to load statistics');
    }
  }, [adminUserId, getHeaders]);
  
  const fetchUsers = useCallback(async () => {
    if (!adminUserId) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/users`, {
        headers: getHeaders()
      });
      setUsers(response.data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('Failed to load users');
    }
  }, [adminUserId, getHeaders]);
  
  const fetchUserDetails = useCallback(async (userId: string) => {
    if (!adminUserId) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/users/${userId}`, {
        headers: getHeaders()
      });
      setSelectedUser(response.data);
    } catch (err) {
      console.error('Failed to fetch user details:', err);
      setError('Failed to load user details');
    }
  }, [adminUserId, getHeaders]);
  
  const fetchAuditLogs = useCallback(async () => {
    if (!adminUserId) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/admin/audit-log`, {
        headers: getHeaders()
      });
      setAuditLogs(response.data.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      // Don't set error for audit logs - it's not critical
    }
  }, [adminUserId, getHeaders]);
  
  // Initial data load
  useEffect(() => {
    if (adminUserId) {
      setLoading(true);
      Promise.all([fetchStats(), fetchUsers()])
        .finally(() => setLoading(false));
    }
  }, [adminUserId, fetchStats, fetchUsers]);
  
  // Fetch audit logs when tab changes to 'audit'
  useEffect(() => {
    if (activeTab === 'audit' && adminUserId) {
      fetchAuditLogs();
    }
  }, [activeTab, adminUserId, fetchAuditLogs]);
  
  // ============================================
  // ACTIONS
  // ============================================
  
  const handleDeleteUser = async (userId: string) => {
    setDeleting(true);
    try {
      await axios.delete(`${API_BASE_URL}/api/admin/users/${userId}`, {
        headers: getHeaders()
      });
      
      // Refresh data
      await Promise.all([fetchStats(), fetchUsers()]);
      setShowDeleteModal(null);
      setSelectedUser(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };
  
  const handleViewUserDashboard = (userId: string, workspaceId: string) => {
    // Navigate to read-only dashboard view
    router.push(`/admin/users/${userId}/workspaces/${workspaceId}`);
  };
  
  // ============================================
  // CHART DATA
  // ============================================
  
  const workspaceTypeData = stats ? [
    { name: 'Delays (Case A)', value: stats.workspace_types.delays, color: COLORS.delays },
    { name: 'Late Days (Case B)', value: stats.workspace_types.late_days, color: COLORS.late_days },
    { name: 'Mixed (Case C)', value: stats.workspace_types.mixed, color: COLORS.mixed }
  ].filter(d => d.value > 0) : [];
  
  // Filter users by search
  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  // ============================================
  // LOADING STATE (auth is handled by layout)
  // ============================================
  
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading admin data...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center p-4 py-20">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null);
              fetchStats();
              fetchUsers();
            }}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  
  // ============================================
  // MAIN RENDER
  // ============================================
  
  return (
    <div className="py-6">
      {/* Content Header with Tabs */}
      <div className="max-w-7xl mx-auto px-4 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Overview</h1>
            <p className="text-gray-400">Monitor and manage your application</p>
          </div>
          <button
            onClick={() => Promise.all([fetchStats(), fetchUsers()])}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-gray-700">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'users', label: 'User Management', icon: Users },
            { id: 'audit', label: 'Audit Log', icon: Clock }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && stats && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/20 rounded-lg">
                        <Users className="h-6 w-6 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Total Users</p>
                        <p className="text-3xl font-bold">{stats.total_users}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-purple-500/20 rounded-lg">
                        <FolderOpen className="h-6 w-6 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Total Workspaces</p>
                        <p className="text-3xl font-bold">{stats.total_workspaces}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-500/20 rounded-lg">
                        <Package className="h-6 w-6 text-green-400" />
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Total Suppliers</p>
                        <p className="text-3xl font-bold">{stats.total_suppliers}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-yellow-500/20 rounded-lg">
                        <TrendingUp className="h-6 w-6 text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Workspaces/User</p>
                        <p className="text-3xl font-bold">{stats.workspaces_per_user}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Workspace Types Distribution */}
                  <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5 text-purple-400" />
                      Workspace Types Distribution
                    </h3>
                    {workspaceTypeData.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={workspaceTypeData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {workspaceTypeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#1f2937', 
                                border: '1px solid #374151',
                                borderRadius: '8px'
                              }}
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-gray-500">
                        No workspace data
                      </div>
                    )}
                  </div>
                  
                  {/* User Activity Summary */}
                  <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Activity className="h-5 w-5 text-green-400" />
                      Activity Summary
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                        <span className="text-gray-300">Active Users</span>
                        <span className="text-2xl font-bold text-green-400">{stats.active_users}</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                        <span className="text-gray-300">Case A (Delays)</span>
                        <span className="text-2xl font-bold text-blue-400">{stats.workspace_types.delays}</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                        <span className="text-gray-300">Case B (Late Days)</span>
                        <span className="text-2xl font-bold text-purple-400">{stats.workspace_types.late_days}</span>
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                        <span className="text-gray-300">Case C (Mixed)</span>
                        <span className="text-2xl font-bold text-green-400">{stats.workspace_types.mixed}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                {/* Search and Actions */}
                <div className="flex items-center justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users by email or name..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                {/* User List */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">User</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Role</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Workspaces</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-gray-300">Suppliers</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">Created</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-300">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {filteredUsers.map(user => (
                        <tr 
                          key={user.id} 
                          className="hover:bg-gray-700/30 transition-colors"
                        >
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium text-white">{user.email}</p>
                              {user.display_name && (
                                <p className="text-sm text-gray-400">{user.display_name}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.role === 'admin'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-gray-600 text-gray-300'
                            }`}>
                              {user.role.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-white font-medium">{user.workspace_count}</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="text-white font-medium">{user.supplier_count}</span>
                          </td>
                          <td className="px-4 py-4 text-gray-400 text-sm">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => fetchUserDetails(user.id)}
                                className="p-2 hover:bg-gray-600 rounded-lg transition-colors"
                                title="View Details"
                              >
                                <Eye className="h-4 w-4 text-blue-400" />
                              </button>
                              {user.role !== 'admin' && (
                                <button
                                  onClick={() => setShowDeleteModal(user.id)}
                                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                                  title="Delete User"
                                >
                                  <Trash2 className="h-4 w-4 text-red-400" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {filteredUsers.length === 0 && (
                    <div className="px-4 py-12 text-center text-gray-500">
                      No users found
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Audit Tab */}
            {activeTab === 'audit' && (
              <div className="bg-gray-800 rounded-xl border border-gray-700">
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-400" />
                    Recent Admin Actions
                  </h3>
                  <button
                    onClick={fetchAuditLogs}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>
                </div>
                
                {auditLogs.length === 0 ? (
                  <div className="px-4 py-12 text-center text-gray-500">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No audit logs recorded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-700 max-h-[600px] overflow-y-auto">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-gray-700/30 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                log.action.includes('DELETE') ? 'bg-red-500/20 text-red-400' :
                                log.action.includes('CREATE') || log.action.includes('PROMOTE') ? 'bg-green-500/20 text-green-400' :
                                log.action.includes('VIEW') ? 'bg-blue-500/20 text-blue-400' :
                                'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {log.action.replace(/_/g, ' ')}
                              </span>
                              {log.target_type && (
                                <span className="text-xs text-gray-500">
                                  on {log.target_type}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-400">
                              Admin: <span className="text-gray-300">{log.admin_user_id.slice(0, 8)}...</span>
                              {log.target_id && (
                                <> • Target: <span className="text-gray-300">{log.target_id.slice(0, 8)}...</span></>
                              )}
                            </p>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                                  Show details
                                </summary>
                                <pre className="mt-2 p-2 bg-gray-900/50 rounded text-xs text-gray-400 overflow-x-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">
                              {new Date(log.created_at).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-gray-600">
                              {new Date(log.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-700/50">
              <div className="flex items-center gap-3">
                <Users className="h-6 w-6 text-purple-400" />
                <div>
                  <h2 className="text-lg font-bold">{selectedUser.user.email}</h2>
                  <p className="text-sm text-gray-400">{selectedUser.user.display_name || 'No display name'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 hover:bg-gray-600 rounded-lg"
              >
                ✕
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-700/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-400">{selectedUser.stats.workspace_count}</p>
                  <p className="text-sm text-gray-400">Workspaces</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{selectedUser.stats.total_suppliers}</p>
                  <p className="text-sm text-gray-400">Suppliers</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">{selectedUser.stats.total_orders}</p>
                  <p className="text-sm text-gray-400">Orders</p>
                </div>
              </div>
              
              {/* Workspaces List */}
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-purple-400" />
                User Workspaces
                <span className="ml-auto px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                  READ-ONLY VIEW
                </span>
              </h3>
              
              <div className="space-y-2">
                {selectedUser.workspaces.map(ws => (
                  <div
                    key={ws.id}
                    className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-white">{ws.name}</p>
                      <p className="text-sm text-gray-400">
                        {ws.data_type} • {ws.supplier_count} suppliers • {ws.order_count} orders
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        ws.has_data ? 'bg-green-500/20 text-green-400' : 'bg-gray-600 text-gray-400'
                      }`}>
                        {ws.has_data ? 'Has Data' : 'No Data'}
                      </span>
                      {ws.has_data && (
                        <button
                          onClick={() => handleViewUserDashboard(selectedUser.user.id, ws.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium"
                        >
                          <Eye className="h-4 w-4" />
                          View Dashboard
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {selectedUser.workspaces.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No workspaces</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/20 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="text-lg font-bold">Delete User</h3>
            </div>
            
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete this user? This will permanently remove:
            </p>
            
            <ul className="list-disc list-inside text-gray-400 mb-6 space-y-1">
              <li>All user workspaces</li>
              <li>All workspace data</li>
              <li>All custom KPIs</li>
              <li>All predictions and settings</li>
            </ul>
            
            <p className="text-red-400 text-sm font-medium mb-6">
              This action cannot be undone!
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(showDeleteModal)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
