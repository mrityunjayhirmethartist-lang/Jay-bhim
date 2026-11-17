import { BlogArticle } from '../types';

export const BLOGS_DATA: BlogArticle[] = [
  {
    id: 'art-1',
    slug: 'preparing-lossless-audio-dsp-ingestion',
    title: 'The Independent Producer’s Guide to Lossless Audio & DSP Standards',
    excerpt: 'Avoid digital distortion, clipping penalties, and sample-rate mismatches by mastering specifically for global streaming ingestion pipelines.',
    category: 'Audio Engineering & QC',
    readTime: '6 min read',
    publishedDate: 'March 28, 2026',
    author: 'Rudraatma Technical Editorial Desk',
    content: [
      'Digital streaming platforms do not play raw uncompressed files directly to mobile listeners; they encode your master into variable codecs like AAC, Ogg Vorbis, and ALAC. If your source audio is already heavily compressed or clipped, lossy re-encoding generates severe inter-sample peaks.',
      'We require 16-bit or 24-bit stereo WAV or FLAC files exported at 44.1kHz or 48kHz. Never submit MP3 files upsampled to WAV, as frequency cutoffs at 16kHz will immediately flag technical failure during ingestion QC.',
      'Leave at least -1.0 dB True Peak ceiling to ensure that loud mastering limiters do not cause clipping distortion when converted to AAC formats across platforms like Spotify, YouTube Music, and Apple Music.'
    ]
  },
  {
    id: 'art-2',
    slug: 'cover-art-guidelines-avoid-rejections',
    title: 'Cover Art Guidelines: 7 Critical Mistakes That Cause Release Delays',
    excerpt: 'From pixel dimensions to banned retailer icons and blurry text, learn what automated ingestion scanners inspect before approving cover graphics.',
    category: 'Artwork & Visuals',
    readTime: '5 min read',
    publishedDate: 'March 15, 2026',
    author: 'Visual Standards Desk',
    content: [
      'Every major digital streaming platform enforces strict artwork criteria. Cover artwork must be an exact 1:1 square, minimum 3000 x 3000 pixels, in RGB color space at 300 DPI.',
      'The single most common cause of rejection is including third-party brand logos (e.g. Spotify icons, Apple logos), social media handles (@artist), pricing text, or barcode graphics on the artwork.',
      'Furthermore, the title and primary artist text on your artwork must match your metadata letter-for-letter. Any spelling or casing discrepancy causes automatic platform hold.'
    ]
  },
  {
    id: 'art-3',
    slug: 'understanding-isrc-upc-barcodes',
    title: 'Demystifying ISRCs and UPCs: How Song Identification Actually Works',
    excerpt: 'What is the difference between an ISRC for track-level tracking and a UPC for album packaging? How metadata links your digital earnings.',
    category: 'Metadata & Royalties',
    readTime: '7 min read',
    publishedDate: 'February 24, 2026',
    author: 'Catalog Operations',
    content: [
      'An ISRC (International Standard Recording Code) is a unique 12-character alphanumeric code that permanently identifies a specific sound recording. It remains tied to the track even if released across multiple albums or compilations.',
      'A UPC (Universal Product Code) identifies the release package as a whole — whether that is a 1-track single or a 12-track album. When you upload through RUDRAATMA Music Distribution, both are generated and assigned free of charge.',
      'If you are migrating catalog from a previous distributor, retaining your existing ISRC codes ensures you preserve play counts, algorithmic playlist associations, and save history.'
    ]
  },
  {
    id: 'art-4',
    slug: 'music-rights-publishing-vs-master',
    title: 'Master vs. Publishing Rights: What Independent Artists Must Know',
    excerpt: 'Understand how composition copyrights differ from sound recordings, how cover mechanical licenses work, and how to protect your catalog.',
    category: 'Music Rights & Legal',
    readTime: '8 min read',
    publishedDate: 'February 10, 2026',
    author: 'Legal & Rights Advisory',
    content: [
      'Every piece of recorded music embodies two distinct copyrights: the Master (the physical or digital sound recording) and the Publishing (the underlying musical composition and lyrics).',
      'When you distribute music via Rudraatma Music, you retain 100% ownership of your Master recording. You license Rudraatma Music non-exclusively to transmit your recordings to DSPs.',
      'If you write original songs, ensure your songwriter credits, lyricist credits, and publisher declarations are recorded accurately during the metadata submission stage.'
    ]
  },
  {
    id: 'art-5',
    slug: 'how-to-distribute-music-spotify-youtube-india',
    title: 'How to Distribute Music to Spotify & YouTube Music in India (Step-by-Step)',
    excerpt: 'A practical release checklist for Indian independent artists covering lossless WAV preparation, artist profile mapping, release lead times, and ISRC tracking.',
    category: 'Distribution Guides',
    readTime: '7 min read',
    publishedDate: 'April 12, 2026',
    author: 'Rudraatma Artist Operations Desk',
    content: [
      'Releasing a song on Spotify and YouTube Music from India requires clean audio assets, consistent bilingual or English metadata, and sufficient scheduling lead time. Streaming platforms enforce automated compliance checks before indexing any new release.',
      'Start by exporting your final master as a 16-bit or 24-bit WAV or FLAC file alongside a clean 3000 x 3000 px square RGB cover image. Avoid adding website URLs, Instagram handles, or store logos onto cover artwork.',
      'Upload your release inside RUDRAATMA Music Distribution at least 14 calendar days ahead of your planned release date. Our quality review team checks audio and metadata within 24 to 72 business hours before dispatching your tracks to Spotify, YouTube Music, Apple Music, JioSaavn, and Amazon Music.',
      'For YouTube Content ID eligibility, submit only 100% exclusive original recordings without non-exclusive royalty-free beat loops so automated fingerprinting never triggers false disputes.'
    ]
  },
  {
    id: 'art-6',
    slug: 'music-distribution-pricing-india-one-time-vs-subscription',
    title: 'Music Distribution Pricing in India: One-Time Release vs. Annual Plans',
    excerpt: 'Compare pay-per-release pricing in INR against monthly and annual distribution subscriptions so you only pay for the release cadence you actually need.',
    category: 'Pricing & Strategy',
    readTime: '6 min read',
    publishedDate: 'April 26, 2026',
    author: 'Rudraatma Artist Operations Desk',
    content: [
      'Many independent Indian musicians overpay for annual subscriptions when they only plan to drop two or three singles a year. Conversely, prolific producers and labels releasing weekly tracks lose money paying separate per-release fees.',
      'With RUDRAATMA Music Distribution, occasional artists can select transparent one-time releases (₹20 for a Single Track or ₹50 for an EP/Album up to 15 tracks) with zero ongoing subscription fees and free ISRC and UPC barcode generation.',
      'For consistent release schedules, monthly plans range from Starter Monthly (₹149/month for 1 release) to Growth Monthly (₹200/month for 5 releases and Smart Links) and Unlimited Monthly (₹300/month under fair-use compliance), with annual plans saving ₹100 per year.',
      'Eligible newly registered creators who complete Artist Profile verification can also review availability for our First-10 Approved Artists promotional program granting one month of complimentary access upon Super Admin approval.'
    ]
  },
  {
    id: 'art-7',
    slug: 'independent-record-label-setup-india-isrc-royalties',
    title: 'Starting an Independent Music Label in India: Catalogs, ISRCs & Payouts',
    excerpt: 'How boutique Indian record labels organize multi-artist rosters, manage contributor credits, assign label imprints, and reconcile artist payouts.',
    category: 'Label Operations',
    readTime: '8 min read',
    publishedDate: 'May 08, 2026',
    author: 'Catalog Operations',
    content: [
      'Running an independent music label in India involves far more than uploading MP3 files. Labels must separate distinct imprint names, map each featured singer to their accurate DSP artist profile, and maintain verifiable songwriter and producer records.',
      'Inside the Rudraatma Music Label workspace, labels can register dedicated label entities under My Labels, assign track-level ISRC codes and album UPCs, and invite Label Managers or Viewers with role-based permissions.',
      'Before signing artists to your label imprint, document clear split agreements and verify that sample clearances are archived securely so copyright verification requests can be answered promptly.'
    ]
  },
  {
    id: 'art-8',
    slug: 'understanding-indian-streaming-royalties-imps-upi-payouts',
    title: 'How Streaming Royalties & IMPS/UPI Payouts Work for Indian Artists',
    excerpt: 'Understand DSP 60-to-90 day reporting cycles, cleared vs. pending royalty statements, and how Indian artists withdraw verified INR balances.',
    category: 'Metadata & Royalties',
    readTime: '7 min read',
    publishedDate: 'May 19, 2026',
    author: 'Finance & Royalty Operations',
    content: [
      'Unlike instant retail transactions, digital streaming royalties follow an industry-wide 60- to 90-day reconciliation cycle. Streams generated on Spotify, Apple Music, or JioSaavn in January are typically audited and settled by platforms in late March or April.',
      'At RUDRAATMA Music Distribution, new accounts begin at ₹0.00 and only display cleared earnings derived from verified DSP royalty statements—never artificial estimates or projected numbers.',
      'Once cleared balances appear in your financial ledger, Indian artists and labels can request direct payouts in INR via verified Bank Transfer (IMPS/NEFT) or UPI without hidden currency-conversion guesswork.'
    ]
  }
];
