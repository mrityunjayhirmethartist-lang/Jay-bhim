import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { BrandLogo } from '../components/common/BrandLogo';
import {
  ExternalLink,
  Play,
  Pause,
  Share2,
  CheckCircle2,
  Music2,
  Disc3,
  Headphones,
  ArrowRight,
  Radio,
  Sparkles,
  Volume2
} from 'lucide-react';

interface SmartLandingPageProps {
  slug: string;
}

interface SmartLinkData {
  id: string;
  title: string;
  artist: string;
  slug: string;
  clicks: number;
  coverUrl?: string;
  previewAudioUrl?: string;
  releaseDate?: string;
  description?: string;
  genre?: string;
  stores: Record<string, string>;
}

export const SmartLandingPage: React.FC<SmartLandingPageProps> = ({ slug }) => {
  const { navigate } = useRouter();
  const [data, setData] = useState<SmartLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/public/smart-link/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Release landing page not found');
        return res.json();
      })
      .then(json => {
        if (json.success && json.smartLink) {
          setData(json.smartLink);
        } else {
          setError('Release not found or link has expired.');
        }
      })
      .catch(err => {
        setError(err.message || 'Unable to load release.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

  // Audio preview toggle
  const togglePlay = () => {
    if (!audioElement) {
      // Use fallback pleasant ambient snippet or custom preview URL
      const src = data?.previewAudioUrl || 'https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3';
      const audio = new Audio(src);
      audio.onended = () => setIsPlaying(false);
      audio.play().catch(() => {});
      setAudioElement(audio);
      setIsPlaying(true);
    } else {
      if (isPlaying) {
        audioElement.pause();
        setIsPlaying(false);
      } else {
        audioElement.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
      }
    };
  }, [audioElement]);

  const handleStoreClick = (platform: string, url?: string) => {
    if (!url) return;
    // Track click on backend
    fetch(`/api/public/smart-link/${slug}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
    }).catch(() => {});

    // Open store in new tab safely
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShare = () => {
    const fullUrl = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center p-4 text-slate-400 font-sans">
        <Disc3 className="w-10 h-10 text-blue-500 animate-[spin_3s_linear_infinite] mb-3" />
        <p className="text-xs font-mono">Connecting to Rudraatma Smart Link...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center p-6 text-slate-100 font-sans">
        <div className="max-w-md w-full p-8 rounded-3xl bg-[#090e1a] border border-slate-800 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
            <Music2 className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold font-display text-white">Smart Link Not Found</h1>
          <p className="text-xs text-slate-400">
            The link <span className="font-mono text-cyan-400">/link/{slug}</span> does not exist or may have been modified by the artist.
          </p>
          <div className="pt-2">
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
            >
              Go to Rudraatma Music Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Define supported streaming stores with branding
  const storePlatforms = [
    {
      key: 'spotify',
      name: 'Spotify',
      action: 'Play',
      color: '#1DB954',
      badgeBg: 'bg-[#1DB954]/10 border-[#1DB954]/30 text-[#1DB954]',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
      )
    },
    {
      key: 'apple',
      name: 'Apple Music',
      action: 'Listen',
      color: '#FA243C',
      badgeBg: 'bg-[#FA243C]/10 border-[#FA243C]/30 text-[#FA243C]',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.89c.65-.8 1.09-1.92.97-3.04-.94.04-2.07.63-2.74 1.42-.59.68-1.11 1.77-.97 2.86 1.05.08 2.11-.47 2.74-1.24z"/>
        </svg>
      )
    },
    {
      key: 'youtube',
      name: 'YouTube Music',
      action: 'Watch & Listen',
      color: '#FF0000',
      badgeBg: 'bg-[#FF0000]/10 border-[#FF0000]/30 text-[#FF0000]',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      )
    },
    {
      key: 'amazon',
      name: 'Amazon Music',
      action: 'Play',
      color: '#25D1DA',
      badgeBg: 'bg-[#25D1DA]/10 border-[#25D1DA]/30 text-[#25D1DA]',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path d="M13.958 10.09c0 1.25-.03 2.342-.916 3.232-.676.68-1.636 1.05-2.613 1.05-1.42 0-2.313-.91-2.313-2.52 0-2.95 2.45-3.48 4.957-3.48v.415c0 .437.885 1.303.885 1.303zm4.246 6.848c-.287.23-.717.25-.99.043-1.396-1.144-1.64-1.69-2.42-2.887-1.397 1.55-3.23 2.17-5.18 2.17-2.63 0-4.93-1.61-4.93-4.8 0-2.49 1.51-4.14 3.58-4.95 1.83-.71 4.39-.83 6.35-.97v-.55c0-.75-.08-1.66-.55-2.27-.45-.58-1.27-.81-1.99-.81-1.37 0-2.59.69-2.93 2.1-.07.31-.28.53-.6.54l-2.47-.27c-.29-.05-.56-.27-.48-.65C6.18 1.48 9 0 12.37 0c1.72 0 3.96.44 5.31 1.69 1.7 1.55 1.55 3.63 1.55 5.86v4.46c0 1.33.56 1.91 1.09 2.62.24.33.29.73.08 1.02-.53.71-1.48 2.05-2.2 3.29z"/>
        </svg>
      )
    },
    {
      key: 'jiosaavn',
      name: 'JioSaavn',
      action: 'Stream',
      color: '#00D8C8',
      badgeBg: 'bg-[#00D8C8]/10 border-[#00D8C8]/30 text-[#00D8C8]',
      icon: (
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      )
    },
    {
      key: 'wynk',
      name: 'Wynk Music',
      action: 'Play',
      color: '#EE1D52',
      badgeBg: 'bg-[#EE1D52]/10 border-[#EE1D52]/30 text-[#EE1D52]',
      icon: <Music2 className="w-5 h-5" />
    },
    {
      key: 'gaana',
      name: 'Gaana',
      action: 'Play',
      color: '#E72C33',
      badgeBg: 'bg-[#E72C33]/10 border-[#E72C33]/30 text-[#E72C33]',
      icon: <Radio className="w-5 h-5" />
    },
    {
      key: 'tidal',
      name: 'TIDAL',
      action: 'Stream HiFi',
      color: '#00FFFF',
      badgeBg: 'bg-[#00FFFF]/10 border-[#00FFFF]/30 text-[#00FFFF]',
      icon: <Headphones className="w-5 h-5" />
    }
  ];

  // Active stores with configured URLs
  const activeStores = storePlatforms.filter(p => Boolean(data.stores[p.key]));

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Dynamic Ambient Glow matching album art */}
      <div
        className="fixed inset-0 opacity-20 pointer-events-none blur-[140px] scale-125"
        style={{
          backgroundImage: `url(${data.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600'})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover'
        }}
      />

      {/* Top Floating Header */}
      <header className="relative z-20 py-4 px-6 border-b border-slate-900/60 backdrop-blur-md flex items-center justify-between max-w-2xl mx-auto w-full">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <BrandLogo size="sm" variant="full" />
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-medium transition-colors"
        >
          {copied ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Link Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </>
          )}
        </button>
      </header>

      {/* Main Release Card */}
      <main className="flex-1 flex items-center justify-center py-8 px-4 relative z-10">
        <div className="w-full max-w-md bg-[#090e1a]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Cover Artwork Container */}
          <div className="relative group mx-auto rounded-2xl overflow-hidden aspect-square max-w-[280px] shadow-2xl border border-slate-800 bg-slate-950">
            <img
              src={data.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'}
              alt={data.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />

            {/* Audio Preview Overlay Button */}
            <button
              onClick={togglePlay}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-2"
              title="Preview 30s Audio Master"
            >
              <div className="w-14 h-14 rounded-full bg-blue-600/90 flex items-center justify-center shadow-xl shadow-blue-600/40 hover:scale-110 transition-transform">
                {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
              </div>
              <span className="text-[11px] font-mono tracking-wider uppercase font-semibold">
                {isPlaying ? 'Pause Snippet' : 'Play Audio Snippet'}
              </span>
            </button>

            {/* Playing Badge */}
            {isPlaying && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-blue-600 text-white text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-lg">
                <Volume2 className="w-3 h-3 animate-pulse" />
                <span>Now Playing</span>
              </div>
            )}
          </div>

          {/* Release Metadata */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-950/60 border border-blue-800/60 text-blue-400 text-[10px] font-mono font-medium">
              <Sparkles className="w-3 h-3" />
              <span>Official Music Release</span>
            </div>

            <h1 className="text-2xl font-bold text-white font-display tracking-tight leading-tight pt-1">
              {data.title}
            </h1>
            <p className="text-sm font-semibold text-slate-300">
              {data.artist}
            </p>

            {data.description && (
              <p className="text-xs text-slate-400 leading-relaxed pt-1 line-clamp-2 max-w-sm mx-auto">
                {data.description}
              </p>
            )}
          </div>

          {/* Streaming Platforms Action List */}
          <div className="space-y-2.5 pt-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 text-center pb-1">
              Choose your music platform
            </div>

            {activeStores.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900 text-center text-xs text-slate-400">
                Streaming URLs are being populated for this release. Check back shortly!
              </div>
            ) : (
              activeStores.map(store => {
                const url = data.stores[store.key];
                return (
                  <div
                    key={store.key}
                    onClick={() => handleStoreClick(store.key, url)}
                    className="p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] group shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-200 group-hover:text-white transition-colors">
                        {store.icon}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white font-display">
                          {store.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          Official Streaming
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-blue-600 group-hover:bg-blue-600 transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{store.action}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Info */}
          <div className="pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500 font-mono space-y-1">
            <div>Distributed via Rudraatma Music Infrastructure</div>
            <div>Free ISRC & Global Digital Rights Protection</div>
          </div>
        </div>
      </main>

      {/* Bottom Sticky Promotion Bar */}
      <footer className="relative z-20 py-3 text-center text-[11px] text-slate-400 bg-slate-950/80 border-t border-slate-900 backdrop-blur-md">
        <span>Are you an independent artist? </span>
        <button
          onClick={() => navigate('/pricing')}
          className="text-blue-400 hover:underline font-semibold ml-1 inline-flex items-center gap-1"
        >
          <span>Distribute with Rudraatma Music</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </footer>
    </div>
  );
};
