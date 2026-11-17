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
        title: 'Music Distribution Services | Rudraatma Music',
        description: 'Explore global DSP delivery, YouTube Content ID, ISRC & UPC codes, royalty tracking, and artist release support at Rudraatma Music.',
      };
    case '/pricing':
      return {
        title: 'Pricing & Distribution Plans | Rudraatma Music',
        description: 'Compare affordable single, EP, album, and unlimited artist distribution plans with transparent payouts on Rudraatma Music.',
      };
    case '/blogs':
      return {
        title: 'Music Industry Blogs & Guides | Rudraatma Music',
        description: 'Read practical guides on music distribution, royalties, audio mastering, metadata standards, and release promotion.',
      };
    case '/about':
      return {
        title: 'About Us | Rudraatma Music Distribution Platform',
        description: 'Learn how Rudraatma Music empowers independent artists and record labels with 100% rights retention and transparent royalties.',
      };
    case '/contact':
      return {
        title: 'Contact Artist Support Desk | Rudraatma Music',
        description: 'Reach the Rudraatma Music artist support desk for release assistance, label onboarding, royalty inquiries, and distribution help.',
      };
    case '/terms':
      return {
        title: 'Terms & Conditions | Rudraatma Music',
        description: 'Review the official Terms and Conditions governing music distribution, user verification, and platform usage at Rudraatma Music.',
      };
    case '/privacy':
      return {
        title: 'Privacy Policy | Rudraatma Music',
        description: 'Read how Rudraatma Music collects, safeguards, and processes artist metadata, account information, and payout records.',
      };
    case '/refund-policy':
      return {
        title: 'Refund Policy | Rudraatma Music',
        description: 'Understand release fee and subscription refund eligibility rules for Rudraatma Music distribution services.',
      };
    case '/cancellation-policy':
      return {
        title: 'Subscription & Cancellation Policy | Rudraatma Music',
        description: 'Learn how subscription cancellations and catalog preservation work on Rudraatma Music.',
      };
    case '/distribution-agreement':
      return {
        title: 'Music Distribution Agreement | Rudraatma Music',
        description: 'Read the non-exclusive digital music distribution agreement confirming 100% artist master copyright retention.',
      };
    case '/':
    default:
      return {
        title: 'Rudraatma Music – Music Distribution & Artist Platform',
        description: 'Distribute your music to global and regional streaming platforms, manage releases, organize your artists, and track royalty reports with Rudraatma Music.',
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
