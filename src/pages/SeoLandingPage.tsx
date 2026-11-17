import React, { useState } from 'react';
import { useRouter } from '../context/RouterContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { SeoLandingConfig } from '../data/seoLandingPagesData';
import { PRICING_PLANS } from '../data/pricingData';
import {
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Disc3,
  BookOpen
} from 'lucide-react';

interface SeoLandingPageProps {
  config: SeoLandingConfig;
}

export const SeoLandingPage: React.FC<SeoLandingPageProps> = ({ config }) => {
  const { navigate } = useRouter();
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero Section with Semantic Breadcrumb */}
        <section className="py-14 sm:py-20 border-b border-slate-900 bg-gradient-to-b from-[#090e1a] to-[#070b14]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Visual Breadcrumb matching BreadcrumbList Schema */}
            <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-400 font-mono">
              <a
                href="/"
                onClick={(e) => { e.preventDefault(); navigate('/'); }}
                className="hover:text-white transition-colors"
              >
                Home
              </a>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <a
                href="/services"
                onClick={(e) => { e.preventDefault(); navigate('/services'); }}
                className="hover:text-white transition-colors"
              >
                Services
              </a>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-blue-400 truncate">{config.serviceName}</span>
            </nav>

            <div className="max-w-4xl space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-800/80 text-blue-400 text-xs font-mono font-medium">
                <Disc3 className="w-3.5 h-3.5" />
                <span>{config.badge}</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white font-display leading-tight text-balance">
                {config.h1}
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-3xl">
                {config.intro}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <a
                  href={config.primaryCtaHref}
                  onClick={(e) => { e.preventDefault(); navigate(config.primaryCtaHref); }}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all shadow-lg shadow-blue-600/25"
                >
                  <span>{config.primaryCtaLabel}</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="/pricing"
                  onClick={(e) => { e.preventDefault(); navigate('/pricing'); }}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-slate-200 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
                >
                  <span>Compare All INR Plans</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Highlights Grid */}
        <section className="py-14 border-b border-slate-900 bg-[#060912]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl sm:text-2xl font-bold text-white font-display mb-8">
              Key Capabilities with RUDRAATMA Music Distribution
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {config.highlights.map((item, idx) => (
                <div key={idx} className="p-5 rounded-xl bg-[#090e1a] border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <h3 className="text-sm font-bold text-white font-display">{item.title}</h3>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Detailed Topic Sections */}
        <section className="py-16 border-b border-slate-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            {config.sections.map((section, idx) => (
              <div
                key={idx}
                className="p-6 sm:p-8 rounded-2xl bg-[#090e1a] border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              >
                <div className="lg:col-span-5 space-y-3">
                  <div className="text-xs font-mono uppercase tracking-wider text-blue-400">
                    Overview 0{idx + 1}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                    {section.heading}
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {section.body}
                  </p>
                </div>

                <div className="lg:col-span-7 bg-slate-950/60 p-5 sm:p-6 rounded-xl border border-slate-800/80">
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
                    Verified Platform Specifications
                  </div>
                  <ul className="space-y-2.5 text-xs sm:text-sm text-slate-200">
                    {section.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Transparent INR Plans Reference */}
        <section className="py-14 border-b border-slate-900 bg-[#060912]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
                  Transparent INR Plans (No Hidden Deductions)
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Start with one-time release orders or upgrade to recurring artist and label subscriptions.
                </p>
              </div>
              <a
                href="/pricing"
                onClick={(e) => { e.preventDefault(); navigate('/pricing'); }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                <span>View Full 8-Plan Comparison</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PRICING_PLANS.slice(0, 4).map((plan) => (
                <div key={plan.id} className="p-5 rounded-xl bg-[#090e1a] border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-slate-400">{plan.type}</div>
                    <h3 className="text-base font-bold text-white font-display mt-1">{plan.name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-bold font-mono text-white">₹{plan.priceINR}</span>
                      <span className="text-xs text-slate-400">{plan.billingText}</span>
                    </div>
                    <p className="text-xs text-blue-300 mt-2">{plan.allowance}</p>
                  </div>
                  <a
                    href="/pricing"
                    onClick={(e) => { e.preventDefault(); navigate('/pricing'); }}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
                  >
                    <span>Select on Pricing</span>
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Topic FAQs */}
        <section className="py-16 border-b border-slate-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-white font-display text-center mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {config.faqs.map((faq, idx) => {
                const isOpen = openFaqIdx === idx;
                return (
                  <div key={idx} className="rounded-xl border border-slate-800 bg-[#090e1a] overflow-hidden">
                    <button
                      onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-4 sm:p-5 text-left text-xs sm:text-sm font-semibold text-white hover:text-blue-400 transition-colors"
                    >
                      <span>{faq.question}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 ml-4 transition-transform ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-5 sm:px-5 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Contextual Internal Linking Cluster */}
        <section className="py-14 border-b border-slate-900 bg-[#060912]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-blue-400 mb-2">
              <BookOpen className="w-4 h-4" />
              <span>Related Distribution Resources</span>
            </div>
            <h2 className="text-xl font-bold text-white font-display mb-6">
              Explore More from RUDRAATMA Music Distribution
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {config.relatedLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => { e.preventDefault(); navigate(link.href); }}
                  className="p-5 rounded-xl bg-[#090e1a] border border-slate-800 hover:border-blue-500/50 transition-colors flex flex-col justify-between group"
                >
                  <div>
                    <h3 className="text-sm font-bold text-white font-display group-hover:text-blue-300 transition-colors">
                      {link.label}
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">{link.desc}</p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-400">
                    <span>Read More</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};
