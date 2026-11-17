export interface PlatformDestination {
  id: string;
  name: string;
  imageUrl: string;
  region: string;
  type: 'Global Streaming' | 'Regional Streaming' | 'Hi-Fi / Audiophile' | 'Video & Social';
  description: string;
  category: 'Major Global' | 'Regional & South Asian' | 'High Fidelity';
  notes: string;
}

export const PLATFORMS_DIRECTORY: PlatformDestination[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    imageUrl: '/assets/platforms/spotify.jpg',
    region: 'Global (180+ Markets)',
    type: 'Global Streaming',
    category: 'Major Global',
    description: 'Leading global digital music streaming service with algorithmic discovery playlists and artist profile verification.',
    notes: 'Standard delivery target across international catalogs.'
  },
  {
    id: 'apple-music',
    name: 'Apple Music',
    imageUrl: '/assets/platforms/apple-music.jpg',
    region: 'Global (167 Markets)',
    type: 'Global Streaming',
    category: 'Major Global',
    description: 'Lossless & Spatial Audio ecosystem with Apple Music for Artists analytics and curated editorial placement.',
    notes: 'Requires 24-bit/44.1kHz or 16-bit uncompressed master audio.'
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music & Content ID',
    imageUrl: '/assets/platforms/youtube-music.jpg',
    region: 'Global (100+ Markets)',
    type: 'Video & Social',
    category: 'Major Global',
    description: 'Audio streaming and YouTube Art Track generation with optional automated Content ID sound recording fingerprinting.',
    notes: 'Content ID requires 100% exclusive master and publishing rights.'
  },
  {
    id: 'amazon-music',
    name: 'Amazon Music',
    imageUrl: '/assets/platforms/amazon-music.jpg',
    region: 'Global (50+ Markets)',
    type: 'Global Streaming',
    category: 'Major Global',
    description: 'Major music store & streaming service integrated across Alexa smart audio systems and Prime Music tiers.',
    notes: 'Candidate delivery destination for digital commercial releases.'
  },
  {
    id: 'jiosaavn',
    name: 'JioSaavn',
    imageUrl: '/assets/platforms/jiosaavn.jpg',
    region: 'South Asia & Global Diaspora',
    type: 'Regional Streaming',
    category: 'Regional & South Asian',
    description: 'Premier regional streaming platform with massive listenership across India, featuring multi-lingual editorial support.',
    notes: 'Essential regional destination for Hindi, Punjabi, and regional tracks.'
  },
  {
    id: 'deezer',
    name: 'Deezer',
    imageUrl: '/assets/platforms/deezer.jpg',
    region: 'Global (185+ Markets)',
    type: 'Global Streaming',
    category: 'Major Global',
    description: 'European-born global music streaming service with Flow algorithm and user-centric royalty payment models.',
    notes: 'Representative global delivery destination.'
  },
  {
    id: 'tidal',
    name: 'Tidal',
    imageUrl: '/assets/platforms/tidal.jpg',
    region: 'Global (60+ Markets)',
    type: 'Hi-Fi / Audiophile',
    category: 'High Fidelity',
    description: 'Artist-centric streaming platform known for high-resolution lossless audio quality and detailed credit liner notes.',
    notes: 'Recommended for studio audiophile and acoustic recordings.'
  }
];
