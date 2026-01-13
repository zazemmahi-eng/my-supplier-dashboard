import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { createAuthCallbackService } from '@kit/supabase/auth';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import pathsConfig from '~/config/paths.config';

const API_BASE_URL = process.env.NEXT_PUBLIC_SUPPLIER_API_URL ?? 'http://127.0.0.1:8000';

/**
 * Auth Callback Route
 * 
 * After Supabase authenticates the user, this route:
 * 1. Exchanges the auth code for a session
 * 2. Checks the user's role in the backend
 * 3. Redirects to /admin (if admin) or /dashboard (if user)
 */
export async function GET(request: NextRequest) {
  const service = createAuthCallbackService(getSupabaseServerClient());
  const client = getSupabaseServerClient();

  // Exchange auth code for session
  const { nextPath } = await service.exchangeCodeForSession(request, {
    redirectPath: pathsConfig.app.home,
  });

  // Get authenticated user
  const { data: authData } = await client.auth.getUser();
  
  if (authData?.user) {
    try {
      // Check user role in backend
      const response = await fetch(
        `${API_BASE_URL}/api/admin/check-user-role?user_id=${authData.user.id}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const roleData = await response.json();
        
        // Redirect based on role
        if (roleData.is_admin) {
          return redirect(pathsConfig.admin.home);
        }
      }
    } catch (error) {
      // If role check fails, continue with default redirect
      console.error('Role check failed:', error);
    }
  }

  // Default: redirect to dashboard
  return redirect(nextPath);
}
