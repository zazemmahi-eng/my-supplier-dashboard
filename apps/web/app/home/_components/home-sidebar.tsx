'use client';

import { useEffect, useState } from 'react';
import type { JwtPayload } from '@supabase/supabase-js';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarNavigation,
} from '@kit/ui/shadcn-sidebar';

import { AppLogo } from '~/components/app-logo';
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import { navigationConfig } from '~/config/navigation.config';
import { Tables } from '~/lib/database.types';

export function HomeSidebar(props: {
  account?: Tables<'accounts'>;
  user: JwtPayload;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Sidebar collapsible={'icon'}>
      <SidebarHeader className={'h-16 justify-center'}>
        <div className={'flex items-center justify-between space-x-2'}>
          <div>
            <AppLogo className={'max-w-full'} />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarNavigation config={navigationConfig} />
      </SidebarContent>

      <SidebarFooter>
        {/* Éviter l'hydration mismatch en n'affichant le dropdown qu'après le montage */}
        {mounted ? (
          <ProfileAccountDropdownContainer
            user={props.user}
            account={props.account}
          />
        ) : (
          // Placeholder pendant le chargement pour éviter le layout shift
          <div className="h-12 w-full animate-pulse rounded-md bg-gray-200" />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}