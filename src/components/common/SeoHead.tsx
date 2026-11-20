import React, { useEffect } from 'react';
import { useRouter } from '../../context/RouterContext';
import { SEO_LANDING_PAGES } from '../../data/seoLandingPagesData';
import { BLOGS_DATA } from '../../data/blogsData';
import { FAQS_DATA } from '../../data/faqsData';

const CANONICAL_BASE_URL = 'https://rudraatma-music-w7ql.onrender.com';

interface RouteSeoConfig {
  title: string;
  description: string;
  noindex?: boolean;
  structuredData?: Record<string, unknown> | null;
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

function buildBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${CANONICAL_BASE_URL}${item.path === '/' ? '/' : item.path}`,
    })),
  };
}

function getSeoForPath(cleanPath: string): RouteSeoConfig {
  if (PRIVATE_EXACT_PATHS.has(cleanPath) || PRIVATE_PREFIXES.some((prefix) => cleanPath.startsWith(prefix))) {
    if (cleanPath.startsWith('/super-admin')) {
      return {
        title: 'Super Admin Portal | RUDRAATMA Music Distribution',
        description: 'Restricted administrative console for RUDRAATMA Music Distribution operations.',
        noindex: true,
        structuredData: null,
      };
    }
    if (cleanPath.startsWith('/admin')) {
      return {
        title: 'Admin Console | RUDRAATMA Music Distribution',
        description: 'Restricted label administration portal for RUDRAATMA Music Distribution.',
        noindex: true,
        structuredData: null,
      };
    }
    if (cleanPath.startsWith('/dashboard')) {
      return {
        title: 'Artist Dashboard | RUDRAATMA Music Distribution',
        description: 'Manage music releases, royalties, smart links, and artist payouts in RUDRAATMA Music Distribution.',
        noindex: true,
        structuredData: null,
      };
    }
    if (cleanPath === '/signup') {
      return {
        title: 'Artist Sign Up | RUDRAATMA Music Distribution',
        description: 'Create your RUDRAATMA Music Distribution artist or label account.',
        noindex: true,
        structuredData: null,
      };
    }
    if (cleanPath === '/login') {
      return {
        title: 'Artist Login | RUDRAATMA Music Distribution',
        description: 'Sign in to your RUDRAATMA Music Distribution artist dashboard.',
        noindex: true,
        structuredData: null,
      };
    }
    return {
      title: 'Account Portal | RUDRAATMA Music Distribution',
      description: 'Secure account and checkout portal for RUDRAATMA Music Distribution.',
      noindex: true,
      structuredData: null,
    };
  }

  // Dedicated SEO Landing Pages (Service + BreadcrumbList + FAQPage Schema)
  const landing = SEO_LANDING_PAGES[cleanPath];
  if (landing) {
    return {
      title: landing.seoTitle,
      description: landing.metaDescription,
      structuredData: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Service',
            name: landing.serviceName,
            serviceType: landing.serviceType,
            description: landing.metaDescription,
            url: `${CANONICAL_BASE_URL}${landing.slug}`,
            areaServed: {
              '@type': 'Country',
              name: 'India',
            },
            provider: {
              '@type': 'Organization',
              '@id': `${CANONICAL_BASE_URL}/#organization`,
              name: 'RUDRAATMA Music Distribution',
              url: `${CANONICAL_BASE_URL}/`,
            },
          },
          buildBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Services', path: '/services' },
            { name: landing.serviceName, path: landing.slug },
          ]),
          {
            '@type': 'FAQPage',
            mainEntity: landing.faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          },
        ],
      },
    };
  }

  // Individual Blog Article Route (/blogs/:slug)
  if (cleanPath.startsWith('/blogs/')) {
    const slug = cleanPath.replace(/^\/blogs\//, '').split('/')[0];
    const article = BLOGS_DATA.find((a) => a.slug === slug);
    if (article) {
      return {
        title: `${article.title.slice(0, 48)} | RUDRAATMA`,
        description: article.excerpt.slice(0, 158),
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Article',
              headline: article.title,
              description: article.excerpt,
              author: {
                '@type': 'Organization',
                name: article.author,
              },
              publisher: {
                '@type': 'Organization',
                '@id': `${CANONICAL_BASE_URL}/#organization`,
                name: 'RUDRAATMA Music Distribution',
                logo: {
                  '@type': 'ImageObject',
                  url: `${CANONICAL_BASE_URL}/logo.png`,
                },
              },
              mainEntityOfPage: `${CANONICAL_BASE_URL}/blogs/${article.slug}`,
            },
            buildBreadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Blogs', path: '/blogs' },
              { name: article.title, path: `/blogs/${article.slug}` },
            ]),
          ],
        },
      };
    }
  }

  if (cleanPath.startsWith('/link/')) {
    return {
      title: 'Listen Now – Smart Link | RUDRAATMA Music Distribution',
      description: 'Stream official releases distributed by RUDRAATMA Music Distribution across Spotify, Apple Music, YouTube Music, and more.',
      structuredData: null,
    };
  }

  switch (cleanPath) {
    case '/services':
      return {
        title: 'Distribution Services | RUDRAATMA Music Distribution',
        description: 'Explore global streaming delivery, Rudraatma Music Label tools, free ISRC & UPC codes, and royalty reporting at RUDRAATMA Music Distribution.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Service',
              name: 'RUDRAATMA Digital Music Distribution Services',
              serviceType: 'Music Distribution & Label Administration',
              areaServed: 'Worldwide',
              provider: {
                '@type': 'Organization',
                '@id': `${CANONICAL_BASE_URL}/#organization`,
                name: 'RUDRAATMA Music Distribution',
              },
              url: `${CANONICAL_BASE_URL}/services`,
            },
            buildBreadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Services', path: '/services' },
            ]),
          ],
        },
      };
    case '/pricing':
      return {
        title: 'Pricing Plans (INR) | RUDRAATMA Music Distribution',
        description: 'Compare transparent ₹20 single, ₹50 EP/album, monthly, and annual plans with direct INR payouts on RUDRAATMA Music Distribution.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Service',
              name: 'RUDRAATMA Music Distribution Pricing Plans',
              serviceType: 'Digital Music Distribution',
              provider: {
                '@type': 'Organization',
                '@id': `${CANONICAL_BASE_URL}/#organization`,
                name: 'RUDRAATMA Music Distribution',
              },
              url: `${CANONICAL_BASE_URL}/pricing`,
            },
            buildBreadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Pricing', path: '/pricing' },
            ]),
          ],
        },
      };
    case '/blogs':
      return {
        title: 'Music Distribution Guides | RUDRAATMA Music Distribution',
        description: 'Read original guides on Spotify & YouTube distribution, Indian royalty payouts, mastering QC, and ISRC/UPC codes from Rudraatma Music.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'CollectionPage',
              name: 'RUDRAATMA Music Distribution Knowledge Base',
              url: `${CANONICAL_BASE_URL}/blogs`,
            },
            buildBreadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Blogs', path: '/blogs' },
            ]),
          ],
        },
      };
    case '/about':
      return {
        title: 'About RUDRAATMA Music Distribution | Rudraatma Label',
        description: 'Learn how RUDRAATMA Music Distribution empowers Indian artists and independent record labels with 100% copyright retention and clear payouts.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            buildBreadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'About', path: '/about' },
            ]),
          ],
        },
      };
    case '/contact':
      return {
        title: 'Contact Artist Desk | RUDRAATMA Music Distribution',
        description: 'Reach the RUDRAATMA Music Distribution desk for release support, Indian label onboarding, royalty inquiries, and metadata assistance.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            buildBreadcrumbSchema([
              { name: 'Home', path: '/' },
              { name: 'Contact', path: '/contact' },
            ]),
          ],
        },
      };
    case '/terms':
      return {
        title: 'Terms & Conditions | RUDRAATMA Music Distribution',
        description: 'Review the Terms and Conditions for music distribution and artist accounts on RUDRAATMA Music Distribution.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [buildBreadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Terms & Conditions', path: '/terms' }])],
        },
      };
    case '/privacy':
      return {
        title: 'Privacy Policy | RUDRAATMA Music Distribution',
        description: 'Read how RUDRAATMA Music Distribution protects artist metadata, account details, and payout information.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [buildBreadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Privacy Policy', path: '/privacy' }])],
        },
      };
    case '/refund-policy':
      return {
        title: 'Refund Policy | RUDRAATMA Music Distribution',
        description: 'Understand release fee and subscription refund policies for RUDRAATMA Music Distribution plans.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [buildBreadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Refund Policy', path: '/refund-policy' }])],
        },
      };
    case '/cancellation-policy':
      return {
        title: 'Cancellation Policy | RUDRAATMA Music Distribution',
        description: 'Learn how subscription cancellations and catalog retention work at RUDRAATMA Music Distribution.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [buildBreadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Cancellation Policy', path: '/cancellation-policy' }])],
        },
      };
    case '/distribution-agreement':
      return {
        title: 'Distribution Agreement | RUDRAATMA Music Distribution',
        description: 'Read the non-exclusive RUDRAATMA Music Distribution agreement confirming 100% artist master copyright ownership.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [buildBreadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Distribution Agreement', path: '/distribution-agreement' }])],
        },
      };
    case '/':
    default:
      return {
        title: 'Rudraatma Music – Official Music Distribution & Artist Platform',
        description: 'Distribute music globally from India with Rudraatma Music. Affordable INR plans from ₹20, free ISRC & UPC codes, and IMPS/UPI royalty payouts.',
        structuredData: {
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Service',
              name: 'Rudraatma Music Distribution',
              serviceType: 'Online Music Distribution Platform',
              areaServed: {
                '@type': 'Country',
                name: 'India',
              },
              provider: {
                '@type': 'Organization',
                '@id': `${CANONICAL_BASE_URL}/#organization`,
                name: 'Rudraatma Music',
              },
              url: `${CANONICAL_BASE_URL}/`,
            },
            {
              '@type': 'FAQPage',
              mainEntity: FAQS_DATA.slice(0, 6).map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: faq.answer,
                },
              })),
            },
          ],
        },
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

function setRouteStructuredData(data: Record<string, unknown> | null | undefined) {
  const existing = document.head.querySelector('script[data-seo-ld="route"]');
  if (!data) {
    if (existing) existing.remove();
    return;
  }
  const scriptEl = (existing as HTMLScriptElement | null) || document.createElement('script');
  scriptEl.type = 'application/ld+json';
  scriptEl.setAttribute('data-seo-ld', 'route');
  scriptEl.textContent = JSON.stringify(data);
  if (!existing) {
    document.head.appendChild(scriptEl);
  }
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

    upsertMetaTag('property', 'og:site_name', 'Rudraatma Music');
    upsertMetaTag('property', 'og:title', seo.title);
    upsertMetaTag('property', 'og:description', seo.description);
    upsertMetaTag('property', 'og:url', canonicalUrl || `${CANONICAL_BASE_URL}/`);

    upsertMetaTag('name', 'twitter:title', seo.title);
    upsertMetaTag('name', 'twitter:description', seo.description);

    setCanonicalLink(canonicalUrl);
    setRouteStructuredData(seo.structuredData);
  }, [path]);

  return null;
};
