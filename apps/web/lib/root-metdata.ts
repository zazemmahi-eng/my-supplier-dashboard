import { Metadata } from 'next';

import { headers } from 'next/headers';

import appConfig from '~/config/app.config';

/**
 * @name generateRootMetadata
 * @description Generates the root metadata for the application
 */
export const generateRootMetadata = async (): Promise<Metadata> => {
  const headersStore = await headers();
  const csrfToken = headersStore.get('x-csrf-token') ?? '';

  return {
    title: appConfig.title,
    description: appConfig.description,
    metadataBase: new URL(appConfig.url),
    applicationName: appConfig.name,
    other: {
      'csrf-token': csrfToken,
    },
    openGraph: {
      url: appConfig.url,
      siteName: appConfig.name,
      title: appConfig.title,
      description: appConfig.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: appConfig.title,
      description: appConfig.description,
    },
    icons: {
      icon: [
        { url: '/images/logo.png', sizes: '16x16', type: 'image/png' },
        { url: '/images/logo.png', sizes: '32x32', type: 'image/png' },
        { url: '/images/logo.png', sizes: '48x48', type: 'image/png' },
        { url: '/images/logo.png', sizes: '64x64', type: 'image/png' },
        { url: '/images/logo.png', sizes: '128x128', type: 'image/png' },
      ],
      apple: [
        { url: '/images/logo.png', sizes: '180x180', type: 'image/png' },
      ],
      shortcut: '/images/logo.png',
    },
  };
};
