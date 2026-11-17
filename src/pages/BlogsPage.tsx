import React, { useState } from 'react';
import { useRouter } from '../context/RouterContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { BLOGS_DATA } from '../data/blogsData';
import { Search, ArrowLeft, ArrowRight, Clock, ChevronRight } from 'lucide-react';

interface BlogsPageProps {
  articleSlug?: string;
}

export const BlogsPage: React.FC<BlogsPageProps> = ({ articleSlug }) => {
  const { navigate } = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const activeArticle = articleSlug
    ? BLOGS_DATA.find((a) => a.slug === articleSlug) || null
    : null;

  const categories = [
    'All',
    'Distribution Guides',
    'Pricing & Strategy',
    'Label Operations',
    'Audio Engineering & QC',
    'Artwork & Visuals',
    'Metadata & Royalties',
    'Music Rights & Legal',
  ];

  const filteredArticles = BLOGS_DATA.filter((art) => {
    const matchesCategory = selectedCategory === 'All' || art.category === selectedCategory;
    const matchesSearch =
      art.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      art.excerpt.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (activeArticle) {
    const relatedArticles = BLOGS_DATA.filter((a) => a.id !== activeArticle.id).slice(0, 3);
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
        <PublicHeader />

        <main className="flex-1 py-12 sm:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
              <a
                href="/"
                onClick={(e) => { e.preventDefault(); navigate('/'); }}
                className="hover:text-white transition-colors"
              >
                Home
              </a>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <a
                href="/blogs"
                onClick={(e) => { e.preventDefault(); navigate('/blogs'); }}
                className="hover:text-white transition-colors"
              >
                Blogs &amp; Guides
              </a>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-blue-400 truncate max-w-xs sm:max-w-md">{activeArticle.title}</span>
            </nav>

            <article className="p-6 sm:p-10 rounded-2xl bg-[#090e1a] border border-slate-800 shadow-2xl">
              <span className="text-xs font-mono text-blue-400 uppercase tracking-wider">
                {activeArticle.category}
              </span>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white font-display leading-tight mt-2">
                {activeArticle.title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-slate-400 font-mono pb-6 border-b border-slate-800">
                <span>{activeArticle.author}</span>
                <span>·</span>
                <span>{activeArticle.publishedDate}</span>
                <span>·</span>
                <span>{activeArticle.readTime}</span>
              </div>

              <div className="mt-6 space-y-5 text-sm sm:text-base text-slate-200 leading-relaxed font-sans">
                {activeArticle.content.map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>

              {/* Contextual CTA & Internal Links */}
              <div className="mt-10 p-5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white font-display">
                    Ready to Release with RUDRAATMA Music Distribution?
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Explore Indian pricing plans starting at ₹20 one-time or learn about Spotify &amp; YouTube delivery.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <a
                    href="/india-music-distribution"
                    onClick={(e) => { e.preventDefault(); navigate('/india-music-distribution'); }}
                    className="px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
                  >
                    India Distribution
                  </a>
                  <a
                    href="/pricing"
                    onClick={(e) => { e.preventDefault(); navigate('/pricing'); }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                  >
                    View INR Plans
                  </a>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-between">
                <a
                  href="/blogs"
                  onClick={(e) => { e.preventDefault(); navigate('/blogs'); }}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to All Distribution Guides</span>
                </a>
                <a
                  href="/services"
                  onClick={(e) => { e.preventDefault(); navigate('/services'); }}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Distribution Services →
                </a>
              </div>
            </article>

            {/* Related Articles */}
            <section className="mt-12">
              <h2 className="text-lg font-bold text-white font-display mb-5">
                More Music Distribution Guides
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {relatedArticles.map((art) => (
                  <a
                    key={art.id}
                    href={`/blogs/${art.slug}`}
                    onClick={(e) => { e.preventDefault(); navigate(`/blogs/${art.slug}`); }}
                    className="p-5 rounded-xl bg-[#090e1a] border border-slate-800 hover:border-blue-500/40 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <span className="text-[10px] font-mono text-blue-400 uppercase">{art.category}</span>
                      <h3 className="text-sm font-bold text-white font-display mt-1.5 group-hover:text-blue-300 transition-colors line-clamp-2">
                        {art.title}
                      </h3>
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-400">
                      <span>Read Guide</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </main>

        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      <PublicHeader />

      <main className="flex-1 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="max-w-3xl mb-8">
            <span className="text-xs font-mono uppercase tracking-widest text-blue-400">
              RUDRAATMA Knowledge Base
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-display mt-1">
              Music Distribution &amp; Royalty Guides for Indian Artists
            </h1>
            <p className="text-sm text-slate-300 mt-2">
              Authoritative technical guides covering Spotify &amp; YouTube distribution, INR pricing models, lossless audio QC, cover artwork standards, ISRC/UPC barcodes, and Indian royalty payouts.
            </p>
          </div>

          {/* Topic Hub Quick Links */}
          <div className="mb-8 flex flex-wrap gap-2.5 text-xs">
            <a
              href="/india-music-distribution"
              onClick={(e) => { e.preventDefault(); navigate('/india-music-distribution'); }}
              className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-slate-200 hover:text-white transition-colors"
            >
              India Music Distribution Hub
            </a>
            <a
              href="/spotify-youtube-music-distribution"
              onClick={(e) => { e.preventDefault(); navigate('/spotify-youtube-music-distribution'); }}
              className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-slate-200 hover:text-white transition-colors"
            >
              Spotify &amp; YouTube Music Guide
            </a>
            <a
              href="/free-music-distribution-india"
              onClick={(e) => { e.preventDefault(); navigate('/free-music-distribution-india'); }}
              className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-slate-200 hover:text-white transition-colors"
            >
              Free Account &amp; ₹20 Release Guide
            </a>
            <a
              href="/music-label-services"
              onClick={(e) => { e.preventDefault(); navigate('/music-label-services'); }}
              className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-slate-200 hover:text-white transition-colors"
            >
              Music Label Services
            </a>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between mb-8 pb-6 border-b border-slate-900">
            <div className="relative max-w-md w-full">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search articles by title or keyword..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white bg-slate-900/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Articles Grid with crawlable /blogs/:slug anchor URLs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredArticles.length === 0 ? (
              <div className="col-span-full py-16 text-center text-xs text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
                No articles matching your search criteria. Try a different keyword or category.
              </div>
            ) : (
              filteredArticles.map((art) => (
                <a
                  key={art.id}
                  href={`/blogs/${art.slug}`}
                  onClick={(e) => { e.preventDefault(); navigate(`/blogs/${art.slug}`); }}
                  className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 hover:border-blue-500/40 transition-all flex flex-col justify-between group"
                >
                  <div>
                    <span className="text-[11px] font-mono text-blue-400 uppercase tracking-wider">
                      {art.category}
                    </span>
                    <h2 className="text-base font-bold text-white font-display mt-2 group-hover:text-blue-300 transition-colors">
                      {art.title}
                    </h2>
                    <p className="text-xs text-slate-400 mt-2.5 leading-relaxed line-clamp-3">
                      {art.excerpt}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{art.readTime}</span>
                    </div>
                    <span className="text-blue-400 font-semibold group-hover:translate-x-1 transition-transform">
                      Read Guide →
                    </span>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
