import React, { useEffect } from 'react';
import { useRouter } from '../../context/RouterContext';

const CANONICAL_BASE_URL = 'https://rudraatma-music-w7ql.onrender.com';

interface RouteSeoConfig {
  title: string;
  description: string;
  noindex?: boolean;
}

const PRIVATE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/super-admin',
  '/checkout',
];

const PRIVATE_EXACT_PATHS = new Set([
  '/login',
  '/signup',
  '/verify-otp',
  '/forgot-password',
]);

function normalizePath(rawPath: string): string {
  const clean = (rawPath || '/').split('?')[0].split('#')[0] || '/';
  if (clean.length > 1 && clean.endsWith('/')) {
    return clean.slice(0, -1);
  }
  return clean;
}

function getSeoForPath(cleanPath: string): RouteSeoConfig {
  if (PRIVATE_EXACT_PATHS.has(cleanPath) || PRIVATE_PREFIXES.some((prefix) => cleanPath.startsWith(prefix))) {
    if (cleanPath.startsWith('/super-admin')) {
      return {
        title: 'Super Admin Portal | Rudraatma Music',
        description: 'Restricted administrative console for Rudraatma Music operations.',
        noindex: true,
      };
    }
    if (cleanPath.startsWith('/admin')) {
      return {
        title: 'Admin Console | Rudraatma Music',
        description: 'Restricted label administration portal for Rudraatma Music.',
        noindex: true,
      };
    }
    if (cleanPath.startsWith('/dashboard')) {
      return {
        title: 'Artist Dashboard | Rudraatma Music',
        description: 'Manage music releases, royalties, smart links, and artist payouts in Rudraatma Music.',
        noindex: true,
      };
    }
    if (cleanPath === '/signup') {
      return {
        title: 'Artist Sign Up | Rudraatma Music',
        description: 'Create your Rudraatma Music artist or label distribution account.',
        noindex: true,
      };
    }
    if (cleanPath === '/login') {
      return {
        title: 'Artist Login | Rudraatma Music',
        description: 'Sign in to your Rudraatma Music artist distribution dashboard.',
        noindex: true,
      };
    }
    return {
      title: 'Account Portal | Rudraatma Music',
      description: 'Secure account and checkout portal for Rudraatma Music.',
      noindex: true,
    };
  }

  if (cleanPath.startsWith('/link/')) {
    return {
      title: 'Listen Now – Release Smart Link | Rudraatma Music',
      description: 'Stream and discover official releases distributed by Rudraatma Music across Spotify, Apple Music, YouTube Music, and more.',
    };
  }

  switch (cleanPath) {
    case '/services':
      return {
        title: 'Distribution Services | RUDRAATMA Music Distribution',
        description: 'Explore global streaming delivery, Rudraatma Music Label tools, free ISRC & UPC codes, and royalty reporting at RUDRAATMA Music Distribution.',
      };
    case '/pricing':
      return {
        title: 'Pricing Plans | RUDRAATMA Music Distribution',
        description: 'Compare transparent single, EP, album, and unlimited release plans with direct royalty payouts on RUDRAATMA Music Distribution.',
      };
    case '/blogs':
      return {
        title: 'Music Distribution Guides | RUDRAATMA Music Distribution',
        description: 'Read practical guides on music distribution, audio mastering, metadata compliance, and royalties from Rudraatma Music.',
      };
    case '/about':
      return {
        title: 'About RUDRAATMA Music Distribution | Rudraatma Music Label',
        description: 'Learn how RUDRAATMA Music Distribution empowers independent artists and record labels with 100% copyright retention and clear payouts.',
      };
    case '/contact':
      return {
        title: 'Contact Support | RUDRAATMA Music Distribution',
        description: 'Reach the RUDRAATMA Music Distribution artist desk for release support, label onboarding, royalty inquiries, and metadata help.',
      };
    case '/terms':
      return {
        title: 'Terms & Conditions | RUDRAATMA Music Distribution',
        description: 'Review the Terms and Conditions for music distribution and artist accounts on RUDRAATMA Music Distribution.',
      };
    case '/privacy':
      return {
        title: 'Privacy Policy | RUDRAATMA Music Distribution',
        description: 'Read how RUDRAATMA Music Distribution protects artist metadata, account details, and payout information.',
      };
    case '/refund-policy':
      return {
        title: 'Refund Policy | RUDRAATMA Music Distribution',
        description: 'Understand release fee and subscription refund policies for RUDRAATMA Music Distribution plans.',
      };
    case '/cancellation-policy':
      return {
        title: 'Cancellation Policy | RUDRAATMA Music Distribution',
        description: 'Learn how subscription cancellations and catalog retention work at RUDRAATMA Music Distribution.',
      };
    case '/distribution-agreement':
      return {
        title: 'Distribution Agreement | RUDRAATMA Music Distribution',
        description: 'Read the non-exclusive RUDRAATMA Music Distribution agreement confirming 100% artist master copyright ownership.',
      };
    case '/':
    default:
      return {
        title: 'RUDRAATMA Music Distribution – Artist & Label Platform',
        description: 'Distribute music worldwide with RUDRAATMA Music Distribution. Independent music label services, free ISRC & UPC codes, and transparent royalty payouts.',
      };
  }
}

function upsertMetaTag(attribute: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonicalLink(url: string | null) {
  let canonicalEl = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!url) {
    if (canonicalEl) {
      canonicalEl.remove();
    }
    return;
  }
  if (!canonicalEl) {
    canonicalEl = document.createElement('link');
    canonicalEl.setAttribute('rel', 'canonical');
    document.head.appendChild(canonicalEl);
  }
  canonicalEl.setAttribute('href', url);
}

export const SeoHead: React.FC = () => {
  const { path } = useRouter();

  useEffect(() => {
    const cleanPath = normalizePath(path);
    const seo = getSeoForPath(cleanPath);
    const canonicalUrl = seo.noindex
      ? null
      : `${CANONICAL_BASE_URL}${cleanPath === '/' ? '/' : cleanPath}`;

    document.title = seo.title;
    upsertMetaTag('name', 'description', seo.description);
    upsertMetaTag('name', 'robots', seo.noindex ? 'noindex, nofollow' : 'index, follow');
    upsertMetaTag('name', 'googlebot', seo.noindex ? 'noindex, nofollow' : 'index, follow');

    upsertMetaTag('property', 'og:title', seo.title);
    upsertMetaTag('property', 'og:description', seo.description);
    upsertMetaTag('property', 'og:url', canonicalUrl || `${CANONICAL_BASE_URL}/`);

    upsertMetaTag('name', 'twitter:title', seo.title);
    upsertMetaTag('name', 'twitter:description', seo.description);

    setCanonicalLink(canonicalUrl);
  }, [path]);

  return null;
};
