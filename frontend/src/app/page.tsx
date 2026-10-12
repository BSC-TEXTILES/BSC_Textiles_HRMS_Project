'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  MapPin,
  Phone,
  Mail,
  Clock,
  Menu,
  X,
  Lock,
  Check
} from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { getRoleHomePath } from '@/lib/roles';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dashboardPath = session?.user?.role
    ? getRoleHomePath(session.user.role)
    : '/dashboard';

  return (
    <div className="min-h-screen bg-[#FDFCFB] dark:bg-[#0B1120] text-[#1E293B] dark:text-[#E2E8F0] selection:bg-[#0058be] selection:text-white transition-colors duration-200">
      
      {/* 1. TOP UTILITY BAR — Sleek modern micro-header */}
      <div className="border-b border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-[#070C18]/80 backdrop-blur-md text-xs text-slate-500 dark:text-slate-400 py-2.5 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#0058be] dark:text-blue-400 uppercase tracking-widest text-[11px]">
              BSC Textiles Pvt. Ltd.
            </span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
            <span>Contemporary Silk Atelier &amp; Heritage Handlooms • Established 1938</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <span>Showrooms in Belagavi, Davanagere &amp; Shivamogga</span>
          </div>
        </div>
      </div>

      {/* 2. MAIN HEADER — Modern architectural navigation */}
      <header className="sticky top-0 z-40 bg-white/85 dark:bg-[#0B1120]/85 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
          
          {/* Logo & Brand Identity */}
          <Link href="/" className="flex items-center gap-3.5 group">
            <div className="w-12 h-12 relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-1 overflow-hidden shrink-0 shadow-xs transition-transform group-hover:scale-105">
              <Image
                src="/images/bsc_logo.png"
                alt="BSC Textiles Logo"
                width={48}
                height={48}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-bold text-xl sm:text-2xl tracking-tight text-[#0058be] dark:text-blue-400 leading-none">
                BSC TEXTILES
              </span>
              <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-1 font-semibold">
                Karnataka • Est. 1938
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium text-slate-700 dark:text-slate-300">
            <a href="#about" className="hover:text-[#0058be] dark:hover:text-blue-400 transition-colors">
              Our Story
            </a>
            <a href="#operations" className="hover:text-[#0058be] dark:hover:text-blue-400 transition-colors">
              Business Divisions
            </a>
            <a href="#locations" className="hover:text-[#0058be] dark:hover:text-blue-400 transition-colors">
              Showrooms
            </a>
            <a href="#governance" className="hover:text-[#0058be] dark:hover:text-blue-400 transition-colors">
              Workforce Portal
            </a>
            <a href="#contact" className="hover:text-[#0058be] dark:hover:text-blue-400 transition-colors">
              Contact
            </a>
          </nav>

          {/* Right Header Action: Staff Portal & Theme */}
          <div className="flex items-center gap-3.5">
            <ThemeToggle size="sm" />

            {status === 'authenticated' && session?.user ? (
              <Link
                href={dashboardPath}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#0058be] text-white hover:bg-[#0047a0] shadow-xs transition-all active:scale-95"
              >
                <span>Dashboard ({session.user.name?.split(' ')[0] || 'User'})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-[#0058be] dark:text-blue-300 hover:bg-[#0058be] hover:text-white dark:hover:bg-blue-950/60 shadow-2xs transition-all active:scale-95"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Staff Portal</span>
              </Link>
            )}

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B1120] px-6 py-4 space-y-3 text-sm">
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-slate-700 dark:text-slate-200"
            >
              Our Story
            </a>
            <a
              href="#operations"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-slate-700 dark:text-slate-200"
            >
              Business Divisions
            </a>
            <a
              href="#locations"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-slate-700 dark:text-slate-200"
            >
              Showrooms
            </a>
            <a
              href="#governance"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-slate-700 dark:text-slate-200"
            >
              Workforce Portal
            </a>
            <a
              href="#contact"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-1 text-slate-700 dark:text-slate-200"
            >
              Contact
            </a>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full block text-center py-2.5 rounded-lg text-xs font-semibold bg-[#0058be] text-white"
              >
                Sign In to Staff Portal
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* 3. HERO SECTION — Modern Luxury Flagship Presentation */}
        <section className="relative border-b border-slate-200/80 dark:border-slate-800 overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-16 sm:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Left Column: Modern Hero Narrative */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-[#0058be] dark:text-blue-300 border border-blue-200/80 dark:border-blue-900/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0058be] dark:bg-blue-400" />
                  <span>Karnataka’s Modern Textile Enterprise Since 1938</span>
                </div>

                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#1E293B] dark:text-white leading-[1.18] tracking-tight">
                  Eighty-six years of authentic handlooms, pure silk, and modern retail.
                </h1>

                <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed font-sans max-w-xl">
                  BSC Textiles supplies pure silk bridal sarees, traditional handloom drapes,
                  and commercial fabric yardage throughout Karnataka. We combine artisanal weaving
                  craftsmanship with modern, transparent business governance.
                </p>

                {/* Modern Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <a
                    href="#locations"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-[#0058be] hover:bg-[#0047a0] text-white shadow-xs transition-all active:scale-95"
                  >
                    <span>Visit Our Showrooms</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <Link
                    href={status === 'authenticated' ? dashboardPath : '/login'}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-2xs transition-all active:scale-95"
                  >
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>{status === 'authenticated' ? 'Go to Dashboard' : 'Employee Portal Sign In'}</span>
                  </Link>
                </div>

                {/* Key Facts Strip */}
                <div className="pt-6 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap gap-8 text-xs text-slate-600 dark:text-slate-400 font-medium">
                  <div>
                    <span className="block text-xl font-serif font-bold text-[#0058be] dark:text-blue-400">1938</span>
                    <span>Founded in Belagavi</span>
                  </div>
                  <div>
                    <span className="block text-xl font-serif font-bold text-[#0058be] dark:text-blue-400">3 Hubs</span>
                    <span>Belagavi, Davanagere, Shivamogga</span>
                  </div>
                  <div>
                    <span className="block text-xl font-serif font-bold text-[#0058be] dark:text-blue-400">Form T</span>
                    <span>Karnataka Statutory Compliant</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Modern Flagship Showroom Interior with modern framing */}
              <div className="lg:col-span-5">
                <div className="group relative rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-700 shadow-[0_12px_36px_rgba(0,0,0,0.08)] bg-slate-100 dark:bg-slate-800">
                  <div className="relative aspect-4/3 sm:aspect-5/4 w-full overflow-hidden">
                    <Image
                      src="/images/showroom_modern.jpg"
                      alt="BSC Textiles Modern Flagship Showroom"
                      fill
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      priority
                    />
                  </div>
                  <div className="p-4 bg-white/95 dark:bg-[#121A2E]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 text-xs">
                    <span className="font-semibold block text-[#0058be] dark:text-blue-400">
                      Belagavi Flagship Showroom • Modern Interior
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                      Contemporary architectural retail space, fluted walnut cabinetry, and bridal silk lounges.
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* 4. ABOUT US — Modern Editorial Story Layout with Modern Atelier Photo */}
        <section id="about" className="py-20 sm:py-24 border-b border-slate-200/80 dark:border-slate-800 bg-[#FAF9F7] dark:bg-[#0E1526]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Left Column: Modern Design Atelier Photography */}
              <div className="lg:col-span-5 order-2 lg:order-1">
                <div className="group relative rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-700 shadow-[0_12px_36px_rgba(0,0,0,0.06)] bg-white dark:bg-slate-800">
                  <div className="relative aspect-4/3 w-full overflow-hidden">
                    <Image
                      src="/images/atelier_modern.jpg"
                      alt="Contemporary textile design atelier and weaving studio"
                      fill
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4 bg-white/95 dark:bg-[#121A2E]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 text-xs">
                    <span className="font-semibold block text-[#0058be] dark:text-blue-400">
                      Contemporary Weaving Atelier
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                      Architectural design studio combining modern loom precision with pure silk yarn heritage.
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Editorial Heritage Story */}
              <div className="lg:col-span-7 order-1 lg:order-2 space-y-5">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#0058be] dark:text-blue-400">
                  Our Story &amp; Heritage
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl text-slate-900 dark:text-white leading-snug">
                  Preserving indigenous weaving artistry through modern standards.
                </h2>
                
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                  BSC Textiles Pvt. Ltd. was founded in pre-independence Karnataka to connect master handloom
                  weavers directly with families and commercial traders who value authentic textile quality.
                  Over three generations, we have honored this craft by rejecting synthetic counterfeits and
                  prioritizing genuine mulberry silk and authentic zari.
                </p>

                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                  Every saree that enters our collection is inspected for warp-and-weft integrity, colorfastness,
                  and border balance. We maintain direct relationships with weaving clusters, ensuring fair wages
                  for artisans and transparent pricing for our customers.
                </p>

                {/* Three Pillars */}
                <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-slate-200/70 dark:border-slate-800 text-xs">
                  <div>
                    <h3 className="font-serif font-bold text-sm text-slate-900 dark:text-white">Pure Materials</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Certified pure silk yarns with authentic gold and silver zari border craftsmanship.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-sm text-slate-900 dark:text-white">Fair Artisan Trade</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Direct, dependable livelihoods for master weavers and handloom clusters.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-sm text-slate-900 dark:text-white">Karnataka Form T</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      All employees across our retail floors enjoy transparent, statutory-compliant benefits.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* 5. BUSINESS DIVISIONS — With Modern Industrial-Chic Depot Photo */}
        <section id="operations" className="py-20 sm:py-24 border-b border-slate-200/80 dark:border-slate-800 bg-[#FDFCFB] dark:bg-[#0B1120]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8">
            
            <div className="max-w-2xl mb-12">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#0058be] dark:text-blue-400">
                Business Divisions
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl text-slate-900 dark:text-white mt-2">
                Retail Showrooms &amp; Wholesale Distribution
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                Supplying retail families, garment merchants, and institutional buyers.
              </p>
            </div>

            {/* Split Visual Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start mb-12">
              
              <div className="lg:col-span-5">
                <div className="group relative rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-700 shadow-[0_12px_36px_rgba(0,0,0,0.06)] bg-white dark:bg-slate-800">
                  <div className="relative aspect-4/3 w-full overflow-hidden">
                    <Image
                      src="/images/depot_modern.jpg"
                      alt="Modern textile design warehouse and fabric distribution depot"
                      fill
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3.5 bg-white/95 dark:bg-[#121A2E]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 text-xs">
                    <span className="font-semibold block text-[#0058be] dark:text-blue-400">
                      Davanagere Modern Wholesale Hub
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                      Contemporary logistics facility with organized luxury textile yardage and bulk commercial supply.
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 divide-y divide-slate-200/70 dark:divide-slate-800 border-t border-b border-slate-200/70 dark:border-slate-800">
                
                <div className="py-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400">
                    01. Retail Showrooms
                  </div>
                  <h3 className="font-serif text-base text-slate-900 dark:text-white font-medium mt-1">
                    Bridal Silk Sarees &amp; Handlooms
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
                    Specialized bridal lounges in Belagavi and Shivamogga showcasing traditional Mysore and Kanjivaram silks,
                    festive occasion wear, and daily cotton drapes.
                  </p>
                </div>

                <div className="py-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400">
                    02. Wholesale Trade
                  </div>
                  <h3 className="font-serif text-base text-slate-900 dark:text-white font-medium mt-1">
                    Bulk Fabric Yardage &amp; Textile Distribution
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
                    Supplying cotton, silk, and blended yardage to regional retail merchants and garment manufacturing
                    studios across North &amp; Central Karnataka.
                  </p>
                </div>

                <div className="py-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400">
                    03. Institutional Supply
                  </div>
                  <h3 className="font-serif text-base text-slate-900 dark:text-white font-medium mt-1">
                    Corporate &amp; Academic Uniform Textiles
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
                    Standardized, colorfast uniform textiles manufactured for educational institutions, corporate
                    organizations, and healthcare networks.
                  </p>
                </div>

                <div className="py-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400">
                    04. Workforce Portal
                  </div>
                  <h3 className="font-serif text-base text-slate-900 dark:text-white font-medium mt-1">
                    Internal Operations &amp; Form T Governance
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
                    Biometric attendance tracking, shift rostering, leave approvals, and automated monthly payroll
                    for all sales and warehouse personnel.
                  </p>
                </div>

              </div>

            </div>

          </div>
        </section>

        {/* 6. OUR LOCATIONS — Modern Clean Business Directory */}
        <section id="locations" className="py-20 sm:py-24 border-b border-slate-200/80 dark:border-slate-800 bg-[#FAF9F7] dark:bg-[#0E1526]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8">
            
            <div className="max-w-2xl mb-12">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#0058be] dark:text-blue-400">
                Showroom Directory
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl text-slate-900 dark:text-white mt-2">
                Our Locations in Karnataka
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                Customers and commercial partners are welcome to visit our physical facilities.
              </p>
            </div>

            {/* Three-column directory */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Belagavi Flagship */}
              <div className="border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-[#121A2E] p-6 rounded-2xl shadow-xs">
                <div className="text-xs font-bold uppercase tracking-widest text-[#0058be] dark:text-blue-400">
                  BEL-01 • Flagship Store
                </div>
                <h3 className="font-serif text-xl text-slate-900 dark:text-white mt-2">
                  Belagavi
                </h3>
                <div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
                    <span>Khade Bazar, Main Market Area, Belagavi, Karnataka — 590001</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Mon – Sat: 10:00 AM – 9:00 PM</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>+91 831 242 1938</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  Retail Flagship &amp; Regional Corporate Office
                </div>
              </div>

              {/* Davanagere Hub */}
              <div className="border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-[#121A2E] p-6 rounded-2xl shadow-xs">
                <div className="text-xs font-bold uppercase tracking-widest text-[#0058be] dark:text-blue-400">
                  DAV-02 • Wholesale Hub
                </div>
                <h3 className="font-serif text-xl text-slate-900 dark:text-white mt-2">
                  Davanagere
                </h3>
                <div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
                    <span>Mandipet Commercial Complex, Davanagere, Karnataka — 577001</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Mon – Sat: 9:30 AM – 8:30 PM</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>+91 8192 231 938</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  Wholesale Fabric &amp; Weaving Distribution Center
                </div>
              </div>

              {/* Shivamogga Store */}
              <div className="border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-[#121A2E] p-6 rounded-2xl shadow-xs">
                <div className="text-xs font-bold uppercase tracking-widest text-[#0058be] dark:text-blue-400">
                  SHI-03 • Silk Showroom
                </div>
                <h3 className="font-serif text-xl text-slate-900 dark:text-white mt-2">
                  Shivamogga
                </h3>
                <div className="mt-4 space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
                    <span>Gandhi Bazar Heritage Circle, Shivamogga, Karnataka — 577201</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Mon – Sat: 10:00 AM – 9:00 PM</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>+91 8182 271 938</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  Pure Silk Sarees &amp; Festive Collections
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* 7. WORKFORCE & COMPLIANCE — Modern Factual Gateway */}
        <section id="governance" className="py-20 sm:py-24 border-b border-slate-200/80 dark:border-slate-800 bg-[#FDFCFB] dark:bg-[#0B1120]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              <div className="lg:col-span-6 space-y-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#0058be] dark:text-blue-400">
                  Workforce Governance
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl text-slate-900 dark:text-white leading-snug">
                  Built on transparent records and statutory labor compliance.
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                  BSC Textiles operates an integrated Human Capital Portal ensuring fair wages, prompt attendance
                  verification, and accurate shift rosters for over three hundred employees across our stores and facilities.
                </p>

                <ul className="space-y-3 pt-2 text-xs text-slate-700 dark:text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
                    <span><strong>Biometric Attendance:</strong> Daily arrival and departure punches synced with showroom edge terminals.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
                    <span><strong>Transparent Leave Records:</strong> Real-time quota tracking (Casual, Sick, Earned) with manager approvals.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
                    <span><strong>Itemized Monthly Payslips in INR:</strong> Transparent compensation with provident fund and statutory records.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
                    <span><strong>Karnataka Form T Compliant:</strong> Maintained strictly in compliance with Karnataka labor standards.</span>
                  </li>
                </ul>
              </div>

              {/* Right Box: Modern Staff Gateway Card */}
              <div className="lg:col-span-6">
                <div className="border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-[#121A2E] p-8 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.06)] space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0058be] text-white flex items-center justify-center shadow-xs">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-serif font-bold text-lg text-slate-900 dark:text-white">
                        Authorized Employee Gateway
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        For floor sales executives, shift leads, and managers
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Access your assigned shifts, review biometric punch logs, apply for leave, and download
                    official monthly payslips. Role-based credentials are required to sign in.
                  </p>

                  <div className="pt-2">
                    <Link
                      href={status === 'authenticated' ? dashboardPath : '/login'}
                      className="inline-flex items-center justify-center gap-2 w-full px-5 py-3.5 rounded-xl text-sm font-semibold bg-[#0058be] hover:bg-[#0047a0] text-white shadow-xs transition-all active:scale-95"
                    >
                      <span>{status === 'authenticated' ? 'Open Staff Workspace' : 'Sign In to Portal'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center">
                    Forgot password or need terminal access? Contact your Store Manager or HR Administration.
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

      </main>

      {/* 8. FOOTER — Traditional & Modern Corporate Footer */}
      <footer id="contact" className="border-t border-slate-200/80 dark:border-slate-800 bg-[#FAF9F7] dark:bg-[#070C18] py-14 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-slate-200/70 dark:border-slate-800">
            
            {/* Col 1: Identity & Summary */}
            <div className="md:col-span-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 relative rounded-lg bg-white p-1 border border-slate-200 overflow-hidden shadow-2xs">
                  <Image
                    src="/images/bsc_logo.png"
                    alt="BSC Textiles"
                    width={36}
                    height={36}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <span className="font-serif font-bold text-base text-[#0058be] dark:text-blue-400 block leading-tight">
                    BSC TEXTILES
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    Pvt. Ltd. • Est. 1938
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                A heritage enterprise specializing in pure silk sarees, traditional handlooms, and commercial textile distribution across Karnataka.
              </p>
            </div>

            {/* Col 2: Navigation */}
            <div className="md:col-span-2 space-y-2.5">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-900 dark:text-slate-200 block">
                Navigation
              </span>
              <ul className="space-y-1.5">
                <li><a href="#about" className="hover:text-[#0058be] dark:hover:text-white transition-colors">Our Story</a></li>
                <li><a href="#operations" className="hover:text-[#0058be] dark:hover:text-white transition-colors">Business Divisions</a></li>
                <li><a href="#locations" className="hover:text-[#0058be] dark:hover:text-white transition-colors">Showrooms</a></li>
                <li><a href="#governance" className="hover:text-[#0058be] dark:hover:text-white transition-colors">Workforce &amp; Form T</a></li>
                <li><Link href="/login" className="hover:text-[#0058be] dark:hover:text-white transition-colors">Staff Login</Link></li>
              </ul>
            </div>

            {/* Col 3: Showrooms */}
            <div className="md:col-span-3 space-y-2.5">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-900 dark:text-slate-200 block">
                Showrooms
              </span>
              <ul className="space-y-2 text-xs">
                <li>
                  <strong className="text-slate-900 dark:text-slate-200 block">Belagavi (Flagship)</strong>
                  <span>Khade Bazar, Belagavi — 590001</span>
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-slate-200 block">Davanagere (Wholesale)</strong>
                  <span>Mandipet Complex, Davanagere — 577001</span>
                </li>
                <li>
                  <strong className="text-slate-900 dark:text-slate-200 block">Shivamogga (Silk Store)</strong>
                  <span>Gandhi Bazar, Shivamogga — 577201</span>
                </li>
              </ul>
            </div>

            {/* Col 4: Registered Office */}
            <div className="md:col-span-3 space-y-2.5">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-900 dark:text-slate-200 block">
                Registered Office
              </span>
              <p className="text-xs leading-relaxed">
                Khade Bazar Commercial Center, Belagavi, Karnataka 590001
              </p>
              <div className="space-y-1 pt-1 text-xs">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>contact@bsctextiles.com</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>+91 831 242 1938</span>
                </div>
              </div>
            </div>

          </div>

          {/* Legal Bar */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
            <p>© {new Date().getFullYear()} BSC Textiles Pvt. Ltd. All rights reserved.</p>
            <p>Karnataka Shops and Commercial Establishments Act Compliant • Form T Verified</p>
          </div>

        </div>
      </footer>

    </div>
  );
}
