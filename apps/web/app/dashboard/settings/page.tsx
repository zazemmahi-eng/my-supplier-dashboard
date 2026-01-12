import { redirect } from 'next/navigation';

/**
 * Dashboard Settings Page
 * Redirects to the main settings page in /home/settings
 */
export default function DashboardSettingsPage() {
  redirect('/home/settings');
}
