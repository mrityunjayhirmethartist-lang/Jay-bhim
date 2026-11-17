import React from 'react';
import { useRouter } from '../../context/RouterContext';
import { Mail, ShieldCheck, Clock, MapPin } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

export const PublicFooter: React.FC = () => {
  const { navigate } = useRouter();

  return (
    <footer className="bg-[#05080f] border-t border-slate-900 text-slate-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="inline-block text-left group focus:outline-none">
              <BrandLogo size="md" />
            </a>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              RUDRAATMA Music Distribution is an independent digital music distribution and Rudraatma Music Label platform delivering global catalog administration and verified royalty tracking.
            </p>
            <div className="pt-2 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400 shrink-0" />
                <a href="mailto:support@rudraatmamusic.com" className="text-slate-300 hover:text-white transition-colors">
                  support@rudraatmamusic.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Desk Hours: Mon–Fri, 10:00 AM – 6:00 PM IST (Response: 24–48h)</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Direct Artist Payouts via Verified IMPS & UPI</span>
              </div>
            </div>
          </div>

          {/* Platform Navigation */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-300 font-mono font-semibold mb-4">
              Platform & Features
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="hover:text-white transition-colors text-left inline-block">
                  Home Overview
                </a>
              </li>
              <li>
                <a href="/services" onClick={(e) => { e.preventDefault(); navigate('/services'); }} className="hover:text-white transition-colors text-left inline-block">
                  Music Distribution Services
                </a>
              </li>
              <li>
                <a href="/pricing" onClick={(e) => { e.preventDefault(); navigate('/pricing'); }} className="hover:text-white transition-colors text-left inline-block">
                  Pricing &amp; Plans
                </a>
              </li>
              <li>
                <a href="/blogs" onClick={(e) => { e.preventDefault(); navigate('/blogs'); }} className="hover:text-white transition-colors text-left inline-block">
                  Blogs &amp; Knowledge Base
                </a>
              </li>
              <li>
                <a href="/about" onClick={(e) => { e.preventDefault(); navigate('/about'); }} className="hover:text-white transition-colors text-left inline-block">
                  About Rudraatma Music
                </a>
              </li>
              <li>
                <a href="/contact" onClick={(e) => { e.preventDefault(); navigate('/contact'); }} className="hover:text-white transition-colors text-left inline-block">
                  Contact Artist Desk
                </a>
              </li>
            </ul>
          </div>

          {/* Distribution Hubs (Crawlable Topic Cluster Links) */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-300 font-mono font-semibold mb-4">
              Distribution Hubs
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/india-music-distribution" onClick={(e) => { e.preventDefault(); navigate('/india-music-distribution'); }} className="hover:text-white transition-colors text-left inline-block">
                  India Music Distribution
                </a>
              </li>
              <li>
                <a href="/spotify-youtube-music-distribution" onClick={(e) => { e.preventDefault(); navigate('/spotify-youtube-music-distribution'); }} className="hover:text-white transition-colors text-left inline-block">
                  Spotify &amp; YouTube Delivery
                </a>
              </li>
              <li>
                <a href="/free-music-distribution-india" onClick={(e) => { e.preventDefault(); navigate('/free-music-distribution-india'); }} className="hover:text-white transition-colors text-left inline-block">
                  Free Setup &amp; ₹20 Releases
                </a>
              </li>
              <li>
                <a href="/music-label-services" onClick={(e) => { e.preventDefault(); navigate('/music-label-services'); }} className="hover:text-white transition-colors text-left inline-block">
                  Music Label Services
                </a>
              </li>
              <li>
                <a href="/music-distribution-for-independent-artists" onClick={(e) => { e.preventDefault(); navigate('/music-distribution-for-independent-artists'); }} className="hover:text-white transition-colors text-left inline-block">
                  For Independent Artists
                </a>
              </li>
              <li>
                <button onClick={() => navigate('/dashboard')} className="hover:text-white transition-colors text-left">
                  Artist Dashboard
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Agreements */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-300 font-mono font-semibold mb-4">
              Legal & Compliance
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/terms" onClick={(e) => { e.preventDefault(); navigate('/terms'); }} className="hover:text-white transition-colors text-left inline-block">
                  Terms &amp; Conditions
                </a>
              </li>
              <li>
                <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate('/privacy'); }} className="hover:text-white transition-colors text-left inline-block">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/refund-policy" onClick={(e) => { e.preventDefault(); navigate('/refund-policy'); }} className="hover:text-white transition-colors text-left inline-block">
                  Refund Policy
                </a>
              </li>
              <li>
                <a href="/cancellation-policy" onClick={(e) => { e.preventDefault(); navigate('/cancellation-policy'); }} className="hover:text-white transition-colors text-left inline-block">
                  Subscription &amp; Cancellation
                </a>
              </li>
              <li>
                <a href="/distribution-agreement" onClick={(e) => { e.preventDefault(); navigate('/distribution-agreement'); }} className="hover:text-white transition-colors text-left inline-block">
                  Music Distribution Agreement
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>
            © 2026 RUDRAATMA Music Distribution (Rudraatma Music). All Rights Reserved.
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>All visible content in English</span>
            <span>·</span>
            <span>Zero Unverified Claims Policy</span>
            <span>·</span>
            <span>100% Artist Copyright Retention</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
