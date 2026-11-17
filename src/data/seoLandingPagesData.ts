export interface SeoLandingFaq {
  question: string;
  answer: string;
}

export interface SeoLandingSection {
  heading: string;
  body: string;
  bullets: string[];
}

export interface SeoLandingConfig {
  slug: string;
  badge: string;
  seoTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  serviceName: string;
  serviceType: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  highlights: { title: string; detail: string }[];
  sections: SeoLandingSection[];
  faqs: SeoLandingFaq[];
  relatedLinks: { label: string; href: string; desc: string }[];
}

export const SEO_LANDING_PAGES: Record<string, SeoLandingConfig> = {
  '/india-music-distribution': {
    slug: '/india-music-distribution',
    badge: 'India Artist & Label Infrastructure',
    seoTitle: 'Best Music Distribution India | RUDRAATMA Distribution',
    metaDescription: 'Release songs globally with RUDRAATMA Music Distribution in India. Transparent INR pricing, free ISRC & UPC codes, and direct IMPS/UPI royalty payouts.',
    h1: 'Digital Music Distribution Built for Indian Artists & Labels',
    intro: 'RUDRAATMA Music Distribution gives independent singers, regional producers, and Indian record labels an online music distribution platform with clear INR pricing, 100% master copyright ownership, and verified IMPS/UPI royalty settlements.',
    serviceName: 'RUDRAATMA India Digital Music Distribution',
    serviceType: 'Digital Music Distribution Service',
    primaryCtaLabel: 'Start Distributing in India',
    primaryCtaHref: '/signup',
    highlights: [
      { title: 'Transparent INR Pricing', detail: 'Pay-per-release starts at ₹20 (Single) and ₹50 (EP/Album) or scale with Starter, Growth, and Unlimited plans.' },
      { title: 'Global & Indian DSP Reach', detail: 'Deliver approved masters to Spotify, JioSaavn, YouTube Music, Apple Music, Amazon Music, Deezer, and Tidal.' },
      { title: '100% Master Rights Ownership', detail: 'Non-exclusive distribution license where artists keep full ownership of sound recordings and compositions.' },
      { title: 'Direct IMPS & UPI Payouts', detail: 'Verified royalty statements settle cleanly into your INR ledger for withdrawal via Indian bank accounts or UPI.' },
    ],
    sections: [
      {
        heading: 'Designed for Regional & Pan-India Music Ecosystems',
        body: 'From Hindi, Punjabi, Tamil, Telugu, Marathi, Bengali, and Bhojpuri releases to independent electronic and hip-hop catalogs, RUDRAATMA Music Distribution enforces structured metadata checks so bilingual titles, lyricists, and primary artist profiles display accurately across streaming stores.',
        bullets: [
          'Free official ISRC (track-level) and UPC (release-level) barcode generation on all plans',
          'Quality review completed by our operations desk within 24–72 business hours',
          'Supports lossless 16-bit and 24-bit WAV or FLAC uploads alongside 3000x3000px RGB cover art',
          'Smart Links generator on supported plans to share Spotify, Apple Music, and YouTube links in one URL'
        ]
      },
      {
        heading: 'Ethical Ledger Accounting Without Exaggerated Claims',
        body: 'We do not invent fake stream projections or guarantee editorial playlists. Earnings reflect actual DSP royalty reports following each platform’s 60-to-90 day reconciliation schedule.',
        bullets: [
          'Clear distinction between cleared balance, payout history, and active subscription entitlements',
          'Dedicated support ticket system answered Monday–Friday (10:00 AM–6:00 PM IST)',
          'Full catalog takedown and metadata update workflows available inside your dashboard'
        ]
      }
    ],
    faqs: [
      {
        question: 'Which digital music platforms does RUDRAATMA Music Distribution support in India?',
        answer: 'Approved releases can be delivered to global and Indian streaming platforms including Spotify, Apple Music, YouTube Music, JioSaavn, Amazon Music, Deezer, and Tidal after passing technical quality verification.'
      },
      {
        question: 'How do Indian artists receive music streaming royalties?',
        answer: 'Once streaming platforms finalize royalty statements (typically 60–90 days after streams occur), cleared INR earnings appear in your dashboard ledger and can be withdrawn via Indian Bank Transfer (IMPS/NEFT) or verified UPI.'
      },
      {
        question: 'Do I have to pay USD foreign-exchange fees to distribute my music?',
        answer: 'No. RUDRAATMA Music Distribution prices all one-time releases and recurring artist plans directly in Indian Rupees (INR), starting at ₹20 for a Single Track.'
      }
    ],
    relatedLinks: [
      { label: 'Spotify & YouTube Music Distribution', href: '/spotify-youtube-music-distribution', desc: 'Audio QC specs, 14-day release lead times, and Content ID rules.' },
      { label: 'Free Onboarding & Low-Cost INR Options', href: '/free-music-distribution-india', desc: 'What is genuinely free vs. pay-per-release options in India.' },
      { label: 'Music Label Services', href: '/music-label-services', desc: 'Multi-artist rosters, My Labels workspace, and team permissions.' },
      { label: 'Compare All INR Pricing Plans', href: '/pricing', desc: 'Full breakdown of ₹20 singles, ₹50 EPs, and monthly/annual subscriptions.' }
    ]
  },

  '/spotify-youtube-music-distribution': {
    slug: '/spotify-youtube-music-distribution',
    badge: 'Streaming Delivery & Quality Review',
    seoTitle: 'Spotify & YouTube Music Distribution | RUDRAATMA Music',
    metaDescription: 'Distribute lossless WAV & FLAC masters to Spotify and YouTube Music with RUDRAATMA Music Distribution. Fast 24–72h QC review and free ISRC barcodes.',
    h1: 'Spotify & YouTube Music Distribution for Artists & Labels',
    intro: 'Deliver studio-grade singles, EPs, and albums to Spotify and YouTube Music without distorted audio transcoding, artist profile mix-ups, or metadata rejections.',
    serviceName: 'Spotify & YouTube Music Distribution Service',
    serviceType: 'Digital Audio & Video Music Distribution',
    primaryCtaLabel: 'Submit Your Next Release',
    primaryCtaHref: '/signup',
    highlights: [
      { title: 'Lossless Master Pipeline', detail: 'Submit 16-bit or 24-bit WAV/FLAC files (44.1kHz or 48kHz) checked before DSP ingestion.' },
      { title: 'Fast 24–72h Internal QC', detail: 'Technical desk reviews audio specs, artwork, and spelling promptly before dispatching to stores.' },
      { title: 'ISRC Migration Support', detail: 'Bring existing ISRC codes to retain play counts and playlist history when switching distributors.' },
      { title: 'Content ID Compliance', detail: 'YouTube Content ID eligibility supported strictly for 100% exclusive, cleared original recordings.' },
    ],
    sections: [
      {
        heading: 'How Fast Music Distribution Works Without Compromising QC',
        body: 'Rapid delivery fails when tracks get rejected by DSP automated scanners. RUDRAATMA inspects audio files and cover artwork first so your submission enters Spotify and YouTube ingestion queues clean.',
        bullets: [
          'Internal technical compliance review completed in 24 to 72 business hours',
          'Schedule releases 14+ calendar days ahead so Spotify editorial pitching windows stay open',
          'Exact 3000 x 3000 px square RGB artwork check prevents store logo or handle rejections',
          'Automatic Smart Links generate direct Spotify, Apple Music, and YouTube listen buttons'
        ]
      },
      {
        heading: 'YouTube Music & Content ID Best Practices',
        body: 'Protect original compositions on YouTube while avoiding false copyright claims caused by shared beat leases or royalty-free loops.',
        bullets: [
          'Provide accurate lyricist, composer, and producer metadata per track',
          'Exclude non-exclusive construction-kit loops from Content ID fingerprinting',
          'Monitor release status updates in real time: Draft, Submitted, Under Review, Approved'
        ]
      }
    ],
    faqs: [
      {
        question: 'How long does Spotify and YouTube Music distribution take?',
        answer: 'Our team performs technical quality checks within 24 to 72 business hours. After dispatch, Spotify and YouTube typically process ingestion within 5 to 14 calendar days, so we recommend submitting at least 14 days before your target drop date.'
      },
      {
        question: 'Can I keep my existing Spotify streams when moving to RUDRAATMA?',
        answer: 'Yes. Enter the exact existing track ISRC codes, identical track titles, and exact artist name spelling during submission so streaming platforms match your existing catalog history.'
      },
      {
        question: 'Do you charge extra for ISRC or UPC barcodes for Spotify releases?',
        answer: 'No. Every distribution order and subscription on RUDRAATMA Music Distribution includes free ISRC and UPC generation.'
      }
    ],
    relatedLinks: [
      { label: 'Guide: Distributing to Spotify & YouTube in India', href: '/blogs/how-to-distribute-music-spotify-youtube-india', desc: 'Complete step-by-step submission & QC checklist.' },
      { label: 'Lossless Audio & DSP Standards', href: '/blogs/preparing-lossless-audio-dsp-ingestion', desc: 'True Peak ceiling, WAV vs. MP3 rules, and codec preservation.' },
      { label: 'Cover Art Rejection Guidelines', href: '/blogs/cover-art-guidelines-avoid-rejections', desc: '7 critical artwork errors that delay Spotify and Apple ingestion.' },
      { label: 'India Music Distribution Hub', href: '/india-music-distribution', desc: 'Overview of Indian DSPs, INR plans, and IMPS payouts.' }
    ]
  },

  '/free-music-distribution-india': {
    slug: '/free-music-distribution-india',
    badge: 'Transparent Onboarding & Pricing Breakdown',
    seoTitle: 'Free Account & Low-Cost Music Distribution India | RUDRAATMA',
    metaDescription: 'Start with free account setup, free ISRC & UPC codes, First-10 approved artist 1-month offer, or ₹20 single releases at RUDRAATMA Music Distribution.',
    h1: 'Free Account Setup, Promotional Access & Low-Cost Music Distribution in India',
    intro: 'Searching for free music distribution or music distribution without upfront subscription commitments? Here is a 100% transparent breakdown of what is genuinely free on RUDRAATMA Music Distribution alongside our low-cost INR pay-per-release options.',
    serviceName: 'RUDRAATMA Transparent Onboarding & Pay-Per-Release Distribution',
    serviceType: 'Music Distribution & Barcode Services',
    primaryCtaLabel: 'Create Free Artist Account',
    primaryCtaHref: '/signup',
    highlights: [
      { title: 'Free Account & Dashboard', detail: 'Register, verify email via OTP, and organize artist profiles with zero upfront signup fee.' },
      { title: 'Free ISRC & UPC Barcodes', detail: 'Official track ISRCs and release UPCs are generated free on every single, EP, or plan.' },
      { title: 'First-10 Approved Artists Offer', detail: 'First 10 eligible approved artist profiles receive 1 month complimentary access (while slots remain).' },
      { title: '₹20 Single / ₹50 EP Options', detail: 'No mandatory monthly subscription—distribute standalone singles for ₹20 one-time.' },
    ],
    sections: [
      {
        heading: 'What Is Genuinely Free vs. Paid at RUDRAATMA',
        body: 'Many platforms advertise "free distribution" while taking permanent percentage cuts or locking catalogs behind hidden upgrade walls. We publish every cost upfront in INR so you never encounter surprise terms.',
        bullets: [
          'Free: Account creation, dashboard onboarding, and Artist Profile verification submission',
          'Free: ISRC & UPC barcode generation and release Smart Links (on eligible plans)',
          'Promotional Free Month: Available exclusively to the first 10 verified & Super Admin approved artist accounts (up to 5 releases during the complimentary 1-month window, subject to remaining slot count shown inside the dashboard)',
          'Low-Cost One-Time Releases: ₹20 per Single Track or ₹50 per EP/Album (up to 15 tracks) with zero recurring monthly fee'
        ]
      },
      {
        heading: 'Why Affordable INR Pay-Per-Release Beats Hidden Cut Models',
        body: 'For independent musicians releasing occasionally, paying ₹20 once for a Single Track lets you keep 100% copyright ownership and transparent royalty ledger accounting without ongoing subscription anxiety.',
        bullets: [
          'One-time releases are never silently converted into recurring monthly charges',
          'Switch cleanly to Growth Monthly (₹200/mo) or Unlimited (₹300/mo) only when your release schedule grows',
          'Verified Indian bank IMPS/NEFT and UPI payouts on cleared DSP statements'
        ]
      }
    ],
    faqs: [
      {
        question: 'Does RUDRAATMA offer free music distribution without any upfront fees?',
        answer: 'Creating an account, generating ISRC & UPC codes, and submitting your Artist Profile for verification require zero upfront payment. Additionally, our First-10 Approved Artists promotional program provides 1 month of complimentary access upon Super Admin approval while slots remain. Standard ongoing single-track distribution is priced transparently at ₹20 one-time (or ₹50 for an EP/Album).'
      },
      {
        question: 'Are one-time releases automatically renewed into a paid subscription?',
        answer: 'Never. Our ₹20 Single Track and ₹50 EP/Album plans are single one-time purchases without recurring charges.'
      },
      {
        question: 'How do I check if First-10 Approved Artists free slots are still open?',
        answer: 'After signing up and verifying your email, your Artist Dashboard displays the live remaining slot counter out of 10 in real time.'
      }
    ],
    relatedLinks: [
      { label: 'One-Time vs. Annual Pricing Guide', href: '/blogs/music-distribution-pricing-india-one-time-vs-subscription', desc: 'Calculate which INR distribution tier saves you the most.' },
      { label: 'View All 8 INR Distribution Plans', href: '/pricing', desc: 'Compare ₹20 singles, ₹50 albums, monthly, and annual tiers.' },
      { label: 'Music Distribution for Independent Artists', href: '/music-distribution-for-independent-artists', desc: 'Built for solo vocalists, beatmakers, and indie bands.' },
      { label: 'Understand Streaming Royalties & Payouts', href: '/blogs/understanding-indian-streaming-royalties-imps-upi-payouts', desc: 'How cleared balances and IMPS/UPI withdrawals work.' }
    ]
  },

  '/music-label-services': {
    slug: '/music-label-services',
    badge: 'Record Label & Multi-Artist Portal',
    seoTitle: 'Music Label Services & Catalog Tools | RUDRAATMA Music',
    metaDescription: 'Scale your record label with RUDRAATMA Music Label services. Multi-artist rosters, My Labels workspace, team access, and INR royalty ledger tracking.',
    h1: 'Music Label Services & Multi-Artist Catalog Infrastructure',
    intro: 'Built for independent record labels, production houses, and artist collectives in India. Manage multiple imprint names, separate artist rosters, contributor credits, and consolidated royalty ledgers from a single label command center.',
    serviceName: 'Rudraatma Music Label Distribution & Administration',
    serviceType: 'Record Label Distribution & Rights Administration',
    primaryCtaLabel: 'Launch Your Label Workspace',
    primaryCtaHref: '/signup',
    highlights: [
      { title: 'My Labels Imprint Control', detail: 'Register and verify multiple label identities tied cleanly to your catalog metadata.' },
      { title: 'Unlimited Artist Rosters', detail: 'Organize primary singers, featured guests, lyricists, and composers cleanly across releases.' },
      { title: 'Team Role Permissions', detail: 'Invite Label Managers and Viewers via Unlimited plans without sharing root passwords.' },
      { title: 'Label-Level Royalty Exports', detail: 'Filter verified streaming statements by label, artist, track ISRC, store, and territory.' },
    ],
    sections: [
      {
        heading: 'Built for Growing Indian Music Labels & Production Houses',
        body: 'Rudraatma Music Label workflows remove spreadsheet chaos. Whether you manage three indie singers on Growth Monthly (₹200/month) or an entire roster on Unlimited Annual (₹3,500/year), every release passes through uniform technical QC.',
        bullets: [
          'Batch album & EP packaging supporting up to 15 sequential tracks per release',
          'Dedicated UPC barcode assignment per album and unique ISRC per recording',
          'Smart Links generator providing shareable pre-save and listen pages for every roster drop',
          'Formal Other Requests queue for metadata amendments and catalog takedowns'
        ]
      },
      {
        heading: 'Transparent Accounting for Label Splits & Payouts',
        body: 'Track every rupee accurately across roster titles. New accounts reflect actual cleared DSP statements only—giving labels clean accounting evidence when settling artist royalties.',
        bullets: [
          'CSV catalog and statement exports for label bookkeeping',
          'Verified Indian bank transfer (IMPS/NEFT) and UPI payout workflows',
          'Priority technical inspection and artist relations ticket support'
        ]
      }
    ],
    faqs: [
      {
        question: 'Which RUDRAATMA plans include Record Label profile management?',
        answer: 'Growth Monthly (₹200/mo), Growth Annual (₹2,300/yr), Unlimited Monthly (₹300/mo), and Unlimited Annual (₹3,500/yr) include My Labels management, multi-artist rosters, and Smart Links. Unlimited tiers also include multi-user team invites.'
      },
      {
        question: 'Can a record label distribute releases under more than one imprint name?',
        answer: 'Yes. Unlimited plans support multi-label catalog management so production houses can organize distinct genre imprints cleanly.'
      },
      {
        question: 'Does Rudraatma claim any master rights from labels on the platform?',
        answer: 'No. Labels and artists retain 100% copyright and master ownership under a non-exclusive distribution agreement.'
      }
    ],
    relatedLinks: [
      { label: 'Guide: Starting an Indie Label in India', href: '/blogs/independent-record-label-setup-india-isrc-royalties', desc: 'Catalog architecture, ISRC assignment, and label split practices.' },
      { label: 'Our Distribution Services', href: '/services', desc: 'Complete technical specification across audio, artwork, and ledger.' },
      { label: 'Compare Label Pricing Plans', href: '/pricing', desc: 'Inspect Growth and Unlimited label allowances in INR.' },
      { label: 'Read Distribution Agreement', href: '/distribution-agreement', desc: 'Confirm non-exclusive licensing and 100% master ownership.' }
    ]
  },

  '/music-distribution-for-independent-artists': {
    slug: '/music-distribution-for-independent-artists',
    badge: 'For Solo Singers, Composers & Beatmakers',
    seoTitle: 'Music Distribution for Independent Artists | RUDRAATMA Music',
    metaDescription: 'Independent music distribution built for Indian singers, producers, and composers. Keep 100% copyright ownership with transparent INR royalty payouts.',
    h1: 'Independent Music Distribution Without Giving Up Your Rights',
    intro: 'Release your original singles, EPs, and studio albums across major global and Indian streaming platforms while keeping 100% of your master copyrights and creative independence.',
    serviceName: 'Independent Artist Music Distribution Platform',
    serviceType: 'Independent Music Distribution Service',
    primaryCtaLabel: 'Create Independent Artist Account',
    primaryCtaHref: '/signup',
    highlights: [
      { title: '100% Copyright Ownership', detail: 'Artists retain full ownership of sound recordings, lyrics, compositions, and artwork.' },
      { title: 'Structured Contributor Credits', detail: 'Properly credit singers, lyricists, composers, and producers inside DSP metadata.' },
      { title: 'Step-by-Step Release Tracking', detail: 'Follow every track across Draft, Submitted, Under Review, and Approved states.' },
      { title: 'Direct Support Desk', detail: 'Get helpful human replies from our operations team within 24–48 business hours.' },
    ],
    sections: [
      {
        heading: 'From Bedroom Studio to Global Streaming Platforms',
        body: 'Independent musicians deserve enterprise-grade distribution tools without label politics or confusing foreign currency fees. RUDRAATMA Music Distribution streamlines every technical requirement so you can focus on recording.',
        bullets: [
          'Simple 4-step workflow: Sign Up → Upload WAV/FLAC & Cover Art → Verify Metadata → Track Earnings',
          'Automated artwork verification checks resolution (3000x3000px) and RGB formatting immediately',
          'Shareable Smart Link pages unify Spotify, Apple Music, and YouTube Music links for fans',
          'Affordable entry starting at ₹20 one-time per single track or ₹149/month Starter plans'
        ]
      },
      {
        heading: 'Master vs. Publishing Clarity for Songwriters',
        body: 'We verify ownership declarations and guide independent vocalists and beatmakers on sample clearances and cover song mechanical licensing before songs ever reach digital stores.',
        bullets: [
          'Explicit lyrics & clean version tagging aligned with streaming store rules',
          'Full support for cover songs when original composers and lyricists are credited and licensed',
          'Clear takedown controls whenever you wish to remove or re-release catalog titles'
        ]
      }
    ],
    faqs: [
      {
        question: 'Do I need a record label to distribute music on RUDRAATMA?',
        answer: 'No. Independent solo artists, singers, beatmakers, and bands can register directly, release singles starting at ₹20 one-time, and manage their own catalog without signing to a label.'
      },
      {
        question: 'What audio and artwork files should independent artists prepare?',
        answer: 'Export stereo 16-bit or 24-bit WAV/FLAC audio (44.1kHz or 48kHz) and an exact square 3000 x 3000 px JPG or PNG cover image in RGB color mode with no social handles or store logos.'
      },
      {
        question: 'Can I update track credits or request a takedown later?',
        answer: 'Yes. Metadata correction requests and catalog takedowns can be submitted anytime via the Other Requests portal inside your Artist Dashboard.'
      }
    ],
    relatedLinks: [
      { label: 'Master vs. Publishing Rights Guide', href: '/blogs/music-rights-publishing-vs-master', desc: 'Protect your songwriting and sound recording copyrights.' },
      { label: 'Demystifying ISRCs and UPCs', href: '/blogs/understanding-isrc-upc-barcodes', desc: 'Learn how digital barcodes track every stream.' },
      { label: 'India Music Distribution Overview', href: '/india-music-distribution', desc: 'Explore Indian DSP coverage and IMPS/UPI payout support.' },
      { label: 'Contact Artist Support Desk', href: '/contact', desc: 'Ask our team before submitting your first single or album.' }
    ]
  }
};
