'use client';

import React, { useEffect, useRef } from 'react';

/**
 * NEURAL — World-Class Digital Products Landing Page
 * Self-contained React (JS / TSX) component.
 * Features:
 * - Full-viewport 100dvh locked dark hero landing page
 * - Looping silent video background with poster fallback
 * - Symmetrical abstract lighting with optical veil gradients
 * - Sora variable font weights via font-variation-settings
 * - Pure CSS architecture A (desktop locked 1536x1024) & B (tablet/phone flow)
 * - Zero external CSS dependencies, self-contained <style> block
 * - Pure CSS hamburger toggle + click-away scrim
 * - prefers-reduced-motion media query listener for video and CSS
 * - Entrance retirement lifecycle via useEffect
 */
export default function NeuralLandingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const foot2Ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // (a) prefers-reduced-motion: Pause/resume video background
    const video = videoRef.current;
    if (!video) return;

    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mediaQuery) return;

    const handleMotionChange = () => {
      if (mediaQuery.matches) {
        video.pause();
      } else {
        const playPromise = video.play();
        if (playPromise) {
          playPromise.catch(() => {});
        }
      }
    };

    handleMotionChange();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMotionChange);
    } else if ('addListener' in mediaQuery) {
      (mediaQuery as any).addListener(handleMotionChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMotionChange);
      } else if ('removeListener' in mediaQuery) {
        (mediaQuery as any).removeListener(handleMotionChange);
      }
    };
  }, []);

  useEffect(() => {
    // (b) Entrance retirement after animations end (~2.1s or 4000ms fallback)
    const root = document.documentElement;
    const foot2El = foot2Ref.current;

    const done = () => {
      clearTimeout(timer);
      if (foot2El) {
        foot2El.removeEventListener('animationend', done);
      }
      root.classList.add('is-entered');
    };

    const timer = setTimeout(done, 4000);

    if (foot2El) {
      foot2El.addEventListener('animationend', done);
    }

    return () => {
      clearTimeout(timer);
      if (foot2El) {
        foot2El.removeEventListener('animationend', done);
      }
      root.classList.remove('is-entered');
    };
  }, []);

  return (
    <>
      <style>{`
        @font-face {
          font-family: 'Sora';
          src: url('assets/fonts/sora-variable.ttf') format('truetype-variations'),
               url('https://fonts.gstatic.com/s/sora/v12/xMQbuFFYT72XzQgMpGCkQ298.woff2') format('woff2');
          font-weight: 100 900;
          font-style: normal;
          font-display: block;
        }

        :root {
          --ink: #ffffff;
          --sub: #a2a9b8;
          --nav: #fbfdff;
          --foot: #f4f8fd;
          --hair: rgba(196, 214, 232, 0.72);
          --chev: rgba(214, 232, 250, 0.90);
          --navdim: #e8ecf0;
          --feat: #e2ebf5;
          --veil: 6, 10, 18;

          --cover: max(calc(100vw / 1536), calc(100vh / 1024));
          --fit: calc(100vh / 910);
          --u: min(var(--cover), var(--fit));
          --blur: calc(var(--u) * 26);
          --glow: calc(var(--u) * 34);
          --hairline: max(1px, calc(var(--u) * 1.6));
        }

        @supports (height: 100dvh) {
          :root {
            --cover: max(calc(100vw / 1536), calc(100dvh / 1024));
            --fit: calc(100dvh / 910);
          }
        }

        .neural-wrapper {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          overflow: hidden;
          background: #02060f;
          font-family: 'Sora', system-ui, -apple-system, 'Segoe UI', sans-serif;
          color: var(--ink);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: geometricPrecision;
          box-sizing: border-box;
          z-index: 9999;
        }

        .neural-wrapper *,
        .neural-wrapper *::before,
        .neural-wrapper *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .neural-wrapper a {
          color: inherit;
          text-decoration: none;
        }

        .neural-wrapper li {
          list-style: none;
        }

        .neural-wrapper a:focus-visible {
          outline: 2px solid #9fe0ff;
          outline-offset: 3px;
          border-radius: 4px;
        }

        /* 4. BACKGROUND LAYERS */
        .neural-wrapper .art {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 50%;
          z-index: 0;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: none;
          background: #03060c;
        }

        .neural-wrapper .veil {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(140% 60% at 50% 40%,
              rgba(var(--veil), 0.16) 0%, rgba(var(--veil), 0.057) 50%,
              rgba(var(--veil), 0) 100%),
            linear-gradient(180deg, rgba(var(--veil), 0) 45%,
              rgba(var(--veil), 0.10) 100%);
        }

        .neural-wrapper .bar,
        .neural-wrapper .hero,
        .neural-wrapper .foot {
          position: fixed;
          z-index: 1;
        }

        /* 5. COMPONENT SKIN */
        .neural-wrapper .brand svg {
          fill: var(--ink);
          display: block;
        }

        .neural-wrapper .caret,
        .neural-wrapper .navarrow {
          fill: none;
          stroke: var(--nav);
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .neural-wrapper .navarrow {
          stroke-linecap: square;
          stroke-linejoin: miter;
        }

        .neural-wrapper .pill {
          border: var(--hairline) solid var(--hair);
          border-radius: 999px;
        }

        .neural-wrapper .chev {
          fill: none;
          stroke: var(--chev);
          stroke-width: 1.75;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .neural-wrapper .cta .arrow {
          fill: none;
          stroke: var(--ink);
          stroke-width: 1.6;
          stroke-linecap: square;
          stroke-linejoin: miter;
        }

        .neural-wrapper .rule {
          background: linear-gradient(180deg,
            rgba(186, 200, 214, 0.70) 0%, rgba(206, 220, 232, 0.92) 52%,
            rgba(182, 198, 212, 0.68) 100%);
        }

        .neural-wrapper .cta {
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(6, 12, 22, 0) 45%, rgba(6, 12, 22, 0.12) 78%,
                                    rgba(6, 12, 22, 0.28) 100%),
            linear-gradient(90deg,
              rgba(255, 226, 178, 0.17) 0%, rgba(255, 236, 208, 0.07) 22%,
              rgba(176, 206, 238, 0.03) 55%, rgba(150, 196, 244, 0.09) 100%),
            linear-gradient(90deg,
              rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.17) 12%,
              rgba(255, 255, 255, 0.11) 26%, rgba(255, 255, 255, 0.07) 42%,
              rgba(255, 255, 255, 0.05) 60%, rgba(255, 255, 255, 0.04) 80%,
              rgba(255, 255, 255, 0.04) 100%);
          -webkit-backdrop-filter: blur(var(--blur)) saturate(0.45);
          backdrop-filter: blur(var(--blur)) saturate(0.45);
          box-shadow: 0 calc(var(--u) * -2) calc(var(--u) * 20) rgba(255, 224, 176, 0.20),
                      0 0 var(--glow) rgba(168, 204, 252, 0.16),
                      inset 0 var(--hairline) 0 0 rgba(255, 251, 242, 0.45);
          position: relative;
        }

        .neural-wrapper .cta::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: var(--hairline);
          pointer-events: none;
          background:
            linear-gradient(180deg, rgba(255, 252, 246, 0.95) 0%,
              rgba(255, 252, 246, 0.20) 45%, rgba(255, 252, 246, 0) 78%),
            linear-gradient(90deg,
              rgba(255, 228, 182, 0.95) 0%, rgba(250, 236, 210, 0.70) 12%,
              rgba(226, 230, 234, 0.03) 32%, rgba(214, 226, 240, 0.02) 62%,
              rgba(200, 228, 250, 0.70) 90%, rgba(186, 224, 247, 0.95) 100%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }

        /* PER-ELEMENT VARIABLE WEIGHTS */
        #word { font-variation-settings: 'wght' 531; color: var(--ink); }
        #about { font-variation-settings: 'wght' 506; color: var(--nav); }
        #product { font-variation-settings: 'wght' 506; color: var(--nav); }
        #solutions { font-variation-settings: 'wght' 506; color: var(--nav); }
        #login { font-variation-settings: 'wght' 506; color: var(--nav); }
        #contact { font-variation-settings: 'wght' 581; color: var(--navdim); }
        #h1a, #h1b { font-variation-settings: 'wght' 424; color: var(--ink); }
        #sub1, #sub2 { font-variation-settings: 'wght' 446; color: var(--sub); }
        #cta { font-variation-settings: 'wght' 497; color: var(--ink); }
        #f1, #f2, #f3, #f4 { font-variation-settings: 'wght' 534; color: var(--feat); }
        #foot1, #foot2 { font-variation-settings: 'wght' 521; color: var(--foot); }

        /* 6. ENTRANCE SEQUENCE */
        @media (prefers-reduced-motion: no-preference) {
          :root {
            --ent-line: cubic-bezier(0.16, 1, 0.3, 1);
            --ent-soft: cubic-bezier(0.25, 0.8, 0.35, 1);
            --rise: 9px;
          }

          @keyframes en-wipe {
            from { clip-path: inset(-0.78em 0 calc(100% + 0.78em) 0); translate: 0 var(--rise); }
            to   { clip-path: inset(-0.78em 0 -0.78em 0); translate: 0 0; }
          }
          @keyframes en-lift {
            from { opacity: 0; translate: 0 var(--rise); }
          }
          @keyframes en-settle {
            from { opacity: 0; translate: 0 calc(var(--rise) * 0.7); scale: 0.99; }
          }
          @keyframes en-draw {
            from { scale: 1 0; }
          }

          html:not(.is-entered) .neural-wrapper .brand { animation: en-lift 0.60s var(--ent-soft) 0.12s backwards; }
          html:not(.is-entered) .neural-wrapper #about { animation: en-lift 0.55s var(--ent-soft) 0.20s backwards; }
          html:not(.is-entered) .neural-wrapper #product { animation: en-lift 0.55s var(--ent-soft) 0.25s backwards; }
          html:not(.is-entered) .neural-wrapper #solutions,
          html:not(.is-entered) .neural-wrapper .caret { animation: en-lift 0.55s var(--ent-soft) 0.30s backwards; }
          html:not(.is-entered) .neural-wrapper #login,
          html:not(.is-entered) .neural-wrapper .navarrow { animation: en-lift 0.55s var(--ent-soft) 0.35s backwards; }
          html:not(.is-entered) .neural-wrapper .pill { animation: en-settle 0.60s var(--ent-soft) 0.40s backwards; }
          html:not(.is-entered) .neural-wrapper .burger { animation: en-lift 0.60s var(--ent-soft) 0.40s backwards; }
          html:not(.is-entered) .neural-wrapper #h1a { animation: en-wipe 0.95s var(--ent-line) 0.34s backwards; }
          html:not(.is-entered) .neural-wrapper #h1b { animation: en-wipe 0.95s var(--ent-line) 0.44s backwards; }
          html:not(.is-entered) .neural-wrapper #sub1 { animation: en-lift 0.70s var(--ent-soft) 0.74s backwards; }
          html:not(.is-entered) .neural-wrapper #sub2 { animation: en-lift 0.70s var(--ent-soft) 0.80s backwards; }
          html:not(.is-entered) .neural-wrapper .cta { animation: en-lift 0.80s var(--ent-line) 0.94s backwards; }
          html:not(.is-entered) .neural-wrapper .feats li:nth-child(1) { animation: en-lift 0.60s var(--ent-soft) 1.08s backwards; }
          html:not(.is-entered) .neural-wrapper .feats li:nth-child(2) { animation: en-lift 0.60s var(--ent-soft) 1.15s backwards; }
          html:not(.is-entered) .neural-wrapper .feats li:nth-child(3) { animation: en-lift 0.60s var(--ent-soft) 1.22s backwards; }
          html:not(.is-entered) .neural-wrapper .feats li:nth-child(4) { animation: en-lift 0.60s var(--ent-soft) 1.29s backwards; }
          html:not(.is-entered) .neural-wrapper .rule { animation: en-draw 0.55s var(--ent-line) 1.34s backwards; transform-origin: top; }
          html:not(.is-entered) .neural-wrapper #foot1 { animation: en-lift 0.60s var(--ent-soft) 1.42s backwards; }
          html:not(.is-entered) .neural-wrapper #foot2 { animation: en-lift 0.60s var(--ent-soft) 1.48s backwards; }
        }

        /* 7. ARCHITECTURE A — LOCKED COMPOSITION (desktop) */
        @media (min-width: 1200px) and (min-height: 560px) and (min-aspect-ratio: 100/95) {
          .neural-wrapper .bar,
          .neural-wrapper .hero,
          .neural-wrapper .foot {
            left: 50%;
            width: calc(var(--u) * 1536);
            transform: translateX(-50%);
          }
          .neural-wrapper .bar {
            top: 0;
            height: calc(var(--u) * 120);
          }
          .neural-wrapper .foot {
            bottom: 0;
            height: calc(var(--u) * 140);
          }
          .neural-wrapper .hero {
            top: 50%;
            height: calc(var(--u) * 1024);
            transform: translate(-50%, -50%);
          }
          .neural-wrapper .navtoggle,
          .neural-wrapper .burger,
          .neural-wrapper .scrim {
            display: none;
          }
          .neural-wrapper .navpanel {
            display: contents;
          }
          .neural-wrapper .bar > *,
          .neural-wrapper .foot > *,
          .neural-wrapper .hero > *,
          .neural-wrapper .pill,
          .neural-wrapper .caret,
          .neural-wrapper .navarrow {
            position: absolute;
          }
          .neural-wrapper .menu,
          .neural-wrapper .menu a,
          .neural-wrapper .login {
            position: static;
          }
          .neural-wrapper .title,
          .neural-wrapper .sub,
          .neural-wrapper .feats {
            inset: 0;
            font-weight: inherit;
          }
          .neural-wrapper .bar span,
          .neural-wrapper .foot span,
          .neural-wrapper .title span,
          .neural-wrapper .sub span,
          .neural-wrapper .feats span,
          .neural-wrapper .cta span {
            position: absolute;
            line-height: 0;
            white-space: nowrap;
          }

          /* BOX COORDINATES */
          .neural-wrapper .brand {
            left: calc(var(--u) * 221);
            top: calc(var(--u) * 55);
            display: flex;
            align-items: center;
            gap: calc(var(--u) * 7);
          }
          .neural-wrapper .brand svg {
            width: calc(var(--u) * 23);
            height: calc(var(--u) * 17);
          }
          #word {
            position: relative;
          }
          .neural-wrapper .caret {
            left: calc(var(--u) * 744);
            top: calc(var(--u) * 62.4);
            width: calc(var(--u) * 9);
            height: calc(var(--u) * 6);
            stroke-width: 1.25;
          }
          .neural-wrapper .navarrow {
            left: calc(var(--u) * 1163);
            top: calc(var(--u) * 61.6);
            width: calc(var(--u) * 10);
            height: calc(var(--u) * 9);
            stroke-width: 1.2;
          }
          .neural-wrapper .pill {
            left: calc(var(--u) * 1191.5);
            top: calc(var(--u) * 43.5);
            width: calc(var(--u) * 144);
            height: calc(var(--u) * 44);
          }
          .neural-wrapper .cta {
            left: calc(var(--u) * 625.8);
            top: calc(var(--u) * 555.2);
            width: calc(var(--u) * 279.6);
            height: calc(var(--u) * 46.6);
          }
          .neural-wrapper .cta .arrow {
            position: absolute;
            left: calc(var(--u) * 230.8);
            top: calc(var(--u) * 17.8);
            width: calc(var(--u) * 16);
            height: calc(var(--u) * 11);
          }
          .neural-wrapper .feats li {
            position: absolute;
            width: calc(var(--u) * 220);
            height: calc(var(--u) * 20);
          }
          .neural-wrapper .feats .chev {
            position: absolute;
            left: 0;
            top: 0;
            width: calc(var(--u) * 11);
            height: calc(var(--u) * 20);
          }
          .neural-wrapper .feats li:nth-child(1) { left: calc(var(--u) * 360); top: calc(var(--u) * 718); }
          .neural-wrapper .feats li:nth-child(2) { left: calc(var(--u) * 590); top: calc(var(--u) * 719); }
          .neural-wrapper .feats li:nth-child(3) { left: calc(var(--u) * 803); top: calc(var(--u) * 721); }
          .neural-wrapper .feats li:nth-child(4) { left: calc(var(--u) * 1013); top: calc(var(--u) * 722); }
          .neural-wrapper .rule {
            left: calc(var(--u) * 767);
            top: calc(var(--u) * 792);
            width: calc(var(--u) * 1);
            height: calc(var(--u) * 57);
          }

          /* TYPE COORDINATES */
          #word {
            font-size: calc(var(--u) * 23.4);
            letter-spacing: calc(var(--u) * 4.8);
            transform: translate(0, 0);
          }
          #about {
            font-size: calc(var(--u) * 13.5);
            letter-spacing: calc(var(--u) * -0.5);
            left: calc(var(--u) * 477);
            top: calc(var(--u) * 65.66);
          }
          #product {
            font-size: calc(var(--u) * 13.5);
            letter-spacing: calc(var(--u) * -0.167);
            left: calc(var(--u) * 568.5);
            top: calc(var(--u) * 65.66);
          }
          #solutions {
            font-size: calc(var(--u) * 13.5);
            letter-spacing: calc(var(--u) * -0.5);
            left: calc(var(--u) * 675);
            top: calc(var(--u) * 65.66);
          }
          #login {
            font-size: calc(var(--u) * 13.5);
            letter-spacing: calc(var(--u) * -0.227);
            left: calc(var(--u) * 1002.5);
            top: calc(var(--u) * 66.16);
          }
          #contact {
            font-size: calc(var(--u) * 13.5);
            letter-spacing: calc(var(--u) * 0.25);
            left: 0;
            right: 0;
            text-align: center;
            top: calc(var(--u) * 21.66);
            transform: translateX(calc(var(--u) * -0.5));
          }
          #h1a {
            font-size: calc(var(--u) * 46.8);
            letter-spacing: calc(var(--u) * 0.532);
            left: 0;
            right: 0;
            text-align: center;
            top: calc(var(--u) * 285.222);
            transform: translateX(calc(var(--u) * -1));
          }
          #h1b {
            font-size: calc(var(--u) * 46.8);
            letter-spacing: calc(var(--u) * -0.398);
            left: 0;
            right: 0;
            text-align: center;
            top: calc(var(--u) * 335.222);
            transform: translateX(calc(var(--u) * -3));
          }
          #sub1 {
            font-size: calc(var(--u) * 20.6);
            letter-spacing: calc(var(--u) * 0.367);
            left: 0;
            right: 0;
            text-align: center;
            top: calc(var(--u) * 408.115);
            transform: translateX(calc(var(--u) * -0.5));
          }
          #sub2 {
            font-size: calc(var(--u) * 19.1);
            letter-spacing: calc(var(--u) * -0.632);
            left: 0;
            right: 0;
            text-align: center;
            top: calc(var(--u) * 432.153);
            transform: translateX(calc(var(--u) * -2));
          }
          #cta {
            font-size: calc(var(--u) * 22);
            letter-spacing: calc(var(--u) * -0.312);
            left: 0;
            right: 0;
            text-align: center;
            top: calc(var(--u) * 23.113);
            transform: translateX(calc(var(--u) * -14.5));
          }
          #f1 {
            font-size: calc(var(--u) * 14.6);
            letter-spacing: calc(var(--u) * -0.75);
            left: calc(var(--u) * 26);
            top: calc(var(--u) * 11.266);
          }
          #f2 {
            font-size: calc(var(--u) * 14.6);
            letter-spacing: calc(var(--u) * -0.889);
            left: calc(var(--u) * 26);
            top: calc(var(--u) * 11.266);
          }
          #f3 {
            font-size: calc(var(--u) * 14.6);
            letter-spacing: calc(var(--u) * -1.067);
            left: calc(var(--u) * 26);
            top: calc(var(--u) * 11.266);
          }
          #f4 {
            font-size: calc(var(--u) * 14.6);
            letter-spacing: calc(var(--u) * -1.067);
            left: calc(var(--u) * 29);
            top: calc(var(--u) * 11.266);
          }
          #foot1 {
            font-size: calc(var(--u) * 16.3);
            letter-spacing: calc(var(--u) * -0.256);
            left: 0;
            right: 0;
            text-align: center;
            bottom: calc(var(--u) * 101.344);
            transform: translateX(calc(var(--u) * -0.5));
          }
          #foot2 {
            font-size: calc(var(--u) * 16.3);
            letter-spacing: calc(var(--u) * -0.667);
            left: 0;
            right: 0;
            text-align: center;
            bottom: calc(var(--u) * 76.344);
            transform: translateX(calc(var(--u) * -2));
          }
        }

        /* 8. ARCHITECTURE B — FLOW (large tablet down to phone) */
        @media (max-width: 1199px), (max-height: 559px), (max-aspect-ratio: 100/95) {
          :root {
            --c: min(calc(100vw / 430), calc(100vh / 860));
          }

          .neural-wrapper {
            display: flex;
            flex-direction: column;
            padding: calc(env(safe-area-inset-top, 0px) + calc(var(--c) * 24)) calc(var(--c) * 22)
                     calc(env(safe-area-inset-bottom, 0px) + calc(var(--c) * 22));
          }

          .neural-wrapper .bar,
          .neural-wrapper .hero,
          .neural-wrapper .foot {
            position: static;
            width: 100%;
          }

          .neural-wrapper .bar {
            order: 1;
            position: relative;
            z-index: 5;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: calc(var(--c) * 16);
          }

          .neural-wrapper .brand {
            display: flex;
            align-items: center;
            gap: calc(var(--c) * 8);
          }

          .neural-wrapper .brand svg {
            width: calc(var(--c) * 22);
            height: auto;
          }

          #word {
            font-size: calc(var(--c) * 19);
            letter-spacing: 0.06em;
          }

          /* BURGER MENU */
          .neural-wrapper .navtoggle {
            position: absolute;
            top: 0;
            right: 0;
            width: 1px;
            height: 1px;
            opacity: 0;
            margin: 0;
            pointer-events: none;
          }

          .neural-wrapper .burger {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: calc(var(--c) * 42);
            height: calc(var(--c) * 30);
            border-radius: 999px;
            cursor: pointer;
            border: var(--hairline) solid var(--hair);
            background: rgba(255, 255, 255, 0.03);
            -webkit-backdrop-filter: blur(var(--blur)) saturate(0.45);
            backdrop-filter: blur(var(--blur)) saturate(0.45);
          }

          .neural-wrapper .burger svg {
            width: calc(var(--c) * 19);
            height: auto;
            fill: none;
            stroke: var(--nav);
            stroke-width: 1.4;
            stroke-linecap: round;
          }

          .neural-wrapper .burger svg path {
            transform-box: fill-box;
            transform-origin: center;
            transition: transform 0.24s ease, opacity 0.18s ease;
          }

          .neural-wrapper .navtoggle:focus-visible ~ .burger {
            outline: 2px solid #9fe0ff;
            outline-offset: 3px;
          }

          .neural-wrapper .navtoggle:checked ~ .burger .b1 {
            transform: translateY(6px) rotate(45deg);
          }

          .neural-wrapper .navtoggle:checked ~ .burger .b2 {
            opacity: 0;
          }

          .neural-wrapper .navtoggle:checked ~ .burger .b3 {
            transform: translateY(-6px) rotate(-45deg);
          }

          .neural-wrapper .scrim {
            display: none;
            position: fixed;
            inset: 0;
            z-index: -1;
          }

          .neural-wrapper .navtoggle:checked ~ .scrim {
            display: block;
          }

          /* PANEL */
          .neural-wrapper .navpanel {
            position: absolute;
            top: calc(100% + calc(var(--c) * 12));
            right: 0;
            display: flex;
            flex-direction: column;
            gap: calc(var(--c) * 2);
            width: min(calc(var(--c) * 268), 78vw);
            padding: calc(var(--c) * 12);
            border-radius: calc(var(--c) * 20);
            background:
              linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%,
                                      rgba(255, 255, 255, 0.045) 100%),
              linear-gradient(90deg, rgba(255, 226, 178, 0.06) 0%,
                                     rgba(150, 196, 244, 0.06) 100%),
              linear-gradient(180deg, rgba(6, 12, 22, 0.60) 0%, rgba(6, 12, 22, 0.70) 100%);
            -webkit-backdrop-filter: blur(var(--blur)) saturate(0.45);
            backdrop-filter: blur(var(--blur)) saturate(0.45);
            box-shadow: 0 calc(var(--c) * 14) calc(var(--c) * 38) rgba(2, 6, 14, 0.45);
            opacity: 0;
            transform: translateY(calc(var(--c) * -8)) scale(0.985);
            transform-origin: 100% 0;
            pointer-events: none;
            transition: opacity 0.2s ease, transform 0.2s ease;
          }

          .neural-wrapper .navtoggle:checked ~ .navpanel {
            opacity: 1;
            transform: none;
            pointer-events: auto;
          }

          .neural-wrapper .navpanel .menu {
            display: flex;
            flex-direction: column;
          }

          .neural-wrapper .navpanel .menu a,
          .neural-wrapper .navpanel .login {
            display: flex;
            align-items: center;
            gap: calc(var(--c) * 8);
            padding: calc(var(--c) * 10) calc(var(--c) * 12);
            border-radius: calc(var(--c) * 12);
            font-size: calc(var(--c) * 16);
            color: var(--nav);
            transition: background 0.15s ease;
          }

          .neural-wrapper .navpanel .menu a:hover,
          .neural-wrapper .navpanel .login:hover {
            background: rgba(255, 255, 255, 0.07);
          }

          .neural-wrapper .navpanel .caret,
          .neural-wrapper .navpanel .navarrow {
            margin-left: auto;
            height: auto;
          }

          .neural-wrapper .navpanel .caret {
            width: calc(var(--c) * 10);
          }

          .neural-wrapper .navpanel .navarrow {
            width: calc(var(--c) * 11);
          }

          .neural-wrapper .navpanel .pill {
            margin-top: calc(var(--c) * 8);
            text-align: center;
            white-space: nowrap;
            padding: calc(var(--c) * 11) calc(var(--c) * 16);
            font-size: calc(var(--c) * 15);
          }

          /* HERO (flow base) */
          .neural-wrapper .hero {
            order: 2;
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            gap: calc(var(--c) * 20);
          }

          .neural-wrapper .title {
            font-size: calc(var(--c) * 33);
            line-height: 1.12;
            max-width: 15ch;
          }

          .neural-wrapper .sub {
            color: var(--sub);
            font-size: calc(var(--c) * 17);
            line-height: 1.32;
            max-width: 26ch;
          }

          .neural-wrapper .cta {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: calc(var(--c) * 12);
            padding: calc(var(--c) * 16) calc(var(--c) * 26);
            font-size: calc(var(--c) * 18);
          }

          .neural-wrapper .cta .arrow {
            width: calc(var(--c) * 16);
            height: calc(var(--c) * 11);
          }

          .neural-wrapper .feats {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: calc(var(--c) * 15) calc(var(--c) * 13);
            width: 100%;
            max-width: calc(var(--c) * 400);
            margin-top: calc(var(--c) * 6);
          }

          .neural-wrapper .feats li {
            display: flex;
            align-items: center;
            gap: calc(var(--c) * 9);
            font-size: calc(var(--c) * 14);
          }

          .neural-wrapper .feats .chev {
            width: calc(var(--c) * 9);
            height: calc(var(--c) * 16);
            flex: none;
          }

          .neural-wrapper .rule {
            width: 1px;
            height: calc(var(--c) * 33);
            margin: calc(var(--c) * 19) auto 0;
          }

          .neural-wrapper .foot {
            order: 3;
            text-align: center;
            color: var(--foot);
            font-size: calc(var(--c) * 13);
            line-height: 1.55;
          }

          .neural-wrapper .foot span {
            display: block;
          }
        }

        /* B1. PHONE CANVAS */
        @media (max-width: 599px), (max-height: 429px) {
          :root {
            --c: min(calc(100vw / 360), calc(100vh / 770), 1px);
            --rise: 6px;
          }

          .neural-wrapper {
            padding: calc(env(safe-area-inset-top, 0px) + calc(var(--c) * 28)) calc(var(--c) * 26)
                     calc(env(safe-area-inset-bottom, 0px) + calc(var(--c) * 26));
          }

          .neural-wrapper .brand svg {
            width: calc(var(--c) * 24);
          }

          #word {
            font-size: calc(var(--c) * 19);
          }

          .neural-wrapper .burger {
            width: calc(var(--c) * 46);
            height: calc(var(--c) * 33);
            position: relative;
          }

          .neural-wrapper .burger::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: max(44px, 100%);
            height: max(44px, 100%);
          }

          .neural-wrapper .burger svg {
            width: calc(var(--c) * 21);
          }

          .neural-wrapper .navpanel {
            width: min(calc(var(--c) * 300), 82vw);
            padding: calc(var(--c) * 15);
            border-radius: calc(var(--c) * 22);
          }

          .neural-wrapper .navpanel .menu a,
          .neural-wrapper .navpanel .login {
            font-size: calc(var(--c) * 16);
            padding: calc(var(--c) * 13) calc(var(--c) * 14);
            border-radius: calc(var(--c) * 13);
            min-height: max(44px, calc(var(--c) * 44));
          }

          .neural-wrapper .navpanel .pill {
            font-size: calc(var(--c) * 16);
            padding: calc(var(--c) * 13) calc(var(--c) * 18);
            margin-top: calc(var(--c) * 9);
          }

          .neural-wrapper .veil {
            background:
              radial-gradient(130% 44% at 50% 45%,
                rgba(var(--veil), 0.50) 0%, rgba(var(--veil), 0.26) 55%,
                rgba(var(--veil), 0) 100%),
              linear-gradient(180deg,
                rgba(var(--veil), 0.34) 0%, rgba(var(--veil), 0) 20%,
                rgba(var(--veil), 0) 60%, rgba(var(--veil), 0.36) 100%);
          }

          .neural-wrapper .hero {
            gap: calc(var(--c) * 22);
          }

          .neural-wrapper .title {
            font-size: calc(var(--c) * 32);
            line-height: 1.2;
            letter-spacing: -0.002em;
            max-width: none;
            text-wrap: balance;
          }

          .neural-wrapper .title span {
            display: block;
          }

          .neural-wrapper .sub {
            font-size: calc(var(--c) * 16);
            line-height: 1.45;
            max-width: none;
            text-wrap: balance;
          }

          .neural-wrapper .sub span {
            display: block;
          }

          .neural-wrapper .cta {
            font-size: calc(var(--c) * 16.5);
            padding: calc(var(--c) * 15) calc(var(--c) * 28);
            gap: calc(var(--c) * 12);
          }

          .neural-wrapper .cta .arrow {
            width: calc(var(--c) * 17);
            height: calc(var(--c) * 12);
          }

          .neural-wrapper .feats {
            grid-template-columns: repeat(2, max-content);
            justify-content: center;
            width: auto;
            max-width: none;
            gap: calc(var(--c) * 16) calc(var(--c) * 16);
            margin-top: calc(var(--c) * 22);
          }

          .neural-wrapper .feats li {
            font-size: calc(var(--c) * 13);
            gap: calc(var(--c) * 10);
          }

          .neural-wrapper .feats .chev {
            width: calc(var(--c) * 10);
            height: calc(var(--c) * 18);
          }

          .neural-wrapper .rule {
            height: calc(var(--c) * 30);
            margin: calc(var(--c) * 28) auto 0;
          }

          .neural-wrapper .foot {
            font-size: calc(var(--c) * 13.5);
            line-height: 1.65;
            text-wrap: balance;
          }
        }

        /* LANDSCAPE PHONES */
        @media (max-height: 429px) and (min-aspect-ratio: 1/1) {
          :root {
            --c: min(calc(100vw / 760), calc(100vh / 430));
          }

          .neural-wrapper .hero {
            gap: calc(var(--c) * 12);
          }

          .neural-wrapper .title {
            font-size: calc(var(--c) * 31);
            line-height: 1.2;
            max-width: 26ch;
          }

          .neural-wrapper .sub {
            font-size: calc(var(--c) * 16);
            max-width: 44ch;
          }

          .neural-wrapper .sub span {
            display: inline;
          }

          .neural-wrapper .cta {
            font-size: calc(var(--c) * 15.5);
            padding: calc(var(--c) * 12) calc(var(--c) * 24);
          }

          .neural-wrapper .feats {
            grid-template-columns: repeat(4, max-content);
            justify-content: center;
            max-width: none;
            gap: calc(var(--c) * 24);
            margin-top: calc(var(--c) * 2);
          }

          .neural-wrapper .feats li {
            font-size: calc(var(--c) * 13.5);
          }

          .neural-wrapper .rule {
            height: calc(var(--c) * 20);
            margin: calc(var(--c) * 10) auto 0;
          }

          .neural-wrapper .foot {
            font-size: calc(var(--c) * 13);
          }
        }

        /* B2. TABLET CANVAS */
        @media (min-width: 600px) and (min-height: 430px) {
          :root {
            --c: min(calc(100vw / 860), calc(100vh / 1120));
          }

          .neural-wrapper {
            padding: calc(env(safe-area-inset-top, 0px) + calc(var(--c) * 40)) calc(var(--c) * 44)
                     calc(env(safe-area-inset-bottom, 0px) + calc(var(--c) * 36));
          }

          .neural-wrapper .brand svg {
            width: calc(var(--c) * 34);
          }

          #word {
            font-size: calc(var(--c) * 30);
          }

          .neural-wrapper .burger {
            width: calc(var(--c) * 60);
            height: calc(var(--c) * 44);
          }

          .neural-wrapper .burger svg {
            width: calc(var(--c) * 27);
            stroke-width: 1.2;
          }

          .neural-wrapper .navpanel {
            width: min(calc(var(--c) * 330), 56vw);
            padding: calc(var(--c) * 16);
            border-radius: calc(var(--c) * 26);
            gap: calc(var(--c) * 4);
          }

          .neural-wrapper .navpanel .menu a,
          .neural-wrapper .navpanel .login {
            font-size: calc(var(--c) * 20);
            padding: calc(var(--c) * 13) calc(var(--c) * 15);
            border-radius: calc(var(--c) * 15);
            gap: calc(var(--c) * 10);
          }

          .neural-wrapper .navpanel .caret {
            width: calc(var(--c) * 13);
          }

          .neural-wrapper .navpanel .navarrow {
            width: calc(var(--c) * 14);
          }

          .neural-wrapper .navpanel .pill {
            margin-top: calc(var(--c) * 10);
            padding: calc(var(--c) * 14) calc(var(--c) * 20);
            font-size: calc(var(--c) * 19);
          }

          .neural-wrapper .hero {
            gap: calc(var(--c) * 26);
          }

          .neural-wrapper .title {
            font-size: calc(var(--c) * 46);
            line-height: 1.15;
            max-width: none;
          }

          .neural-wrapper .title span {
            display: block;
          }

          .neural-wrapper .sub {
            font-size: calc(var(--c) * 21);
            line-height: 1.34;
            max-width: none;
          }

          .neural-wrapper .sub span {
            display: block;
          }

          .neural-wrapper .cta {
            gap: calc(var(--c) * 14);
            padding: calc(var(--c) * 18) calc(var(--c) * 34);
            font-size: calc(var(--c) * 21);
          }

          .neural-wrapper .cta .arrow {
            width: calc(var(--c) * 20);
            height: calc(var(--c) * 14);
          }

          .neural-wrapper .feats {
            grid-template-columns: repeat(2, max-content);
            justify-content: center;
            gap: calc(var(--c) * 22) calc(var(--c) * 54);
            max-width: none;
            margin-top: calc(var(--c) * 12);
          }

          .neural-wrapper .feats li {
            gap: calc(var(--c) * 12);
            font-size: calc(var(--c) * 16);
          }

          .neural-wrapper .feats .chev {
            width: calc(var(--c) * 12);
            height: calc(var(--c) * 21);
          }

          .neural-wrapper .rule {
            height: calc(var(--c) * 46);
            margin: calc(var(--c) * 30) auto 0;
          }

          .neural-wrapper .foot {
            font-size: calc(var(--c) * 16);
          }

          @media (min-aspect-ratio: 1/1) {
            :root {
              --c: min(calc(100vw / 1040), calc(100vh / 780));
            }

            .neural-wrapper .feats {
              grid-template-columns: repeat(4, max-content);
              gap: calc(var(--c) * 40);
            }
          }
        }

        /* 9. DYNAMIC VIEWPORT OVERRIDE */
        @supports (height: 100dvh) {
          @media (max-width: 1199px), (max-height: 559px), (max-aspect-ratio: 100/95) {
            :root {
              --c: min(calc(100vw / 430), calc(100dvh / 860));
            }

            .neural-wrapper {
              height: 100dvh;
            }

            @media (max-width: 599px), (max-height: 429px) {
              :root {
                --c: min(calc(100vw / 360), calc(100dvh / 770), 1px);
              }
            }

            @media (max-height: 429px) and (min-aspect-ratio: 1/1) {
              :root {
                --c: min(calc(100vw / 760), calc(100dvh / 430));
              }
            }

            @media (min-width: 600px) and (min-height: 430px) {
              :root {
                --c: min(calc(100vw / 860), calc(100dvh / 1120));
              }

              @media (min-aspect-ratio: 1/1) {
                :root {
                  --c: min(calc(100vw / 1040), calc(100dvh / 780));
                }
              }
            }
          }
        }

        /* 10. REDUCED MOTION */
        @media (prefers-reduced-motion: reduce) {
          .neural-wrapper * {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div className="neural-wrapper">
        {/* 1) Background Video */}
        <video
          ref={videoRef}
          className="art"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
          poster="https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/130837c4-0244-4f37-9c61-8d801d93fd29.jpg"
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104303_0c6d60b2-9353-408e-9449-585108a22fb5.mp4"
        />

        {/* 2) Veil */}
        <div className="veil" />

        {/* 3) Header Bar */}
        <header className="bar">
          <a className="brand" href="#">
            <svg viewBox="0 0 23 17" aria-hidden="true">
              <path d="M8.15 0.9 L4.55 0.9 L0.5 9.3 L4.1 9.3 Z" />
              <path d="M17.0 0 L13.4 0 L6.15 16.4 L9.75 16.4 Z" />
              <path d="M22.9 0 L19.3 0 L15.0 7.6 L18.6 7.6 Z" />
              <path d="M22.6 6.9 L19.0 6.9 L14.05 16.4 L17.65 16.4 Z" />
            </svg>
            <span id="word">NEURAL</span>
          </a>

          <input className="navtoggle" type="checkbox" id="nav-open" />
          <label className="scrim" htmlFor="nav-open" aria-hidden="true" />
          <label className="burger" htmlFor="nav-open" aria-label="Menu">
            <svg viewBox="0 0 22 14">
              <path className="b1" d="M1 1 H21" />
              <path className="b2" d="M1 7 H21" />
              <path className="b3" d="M1 13 H21" />
            </svg>
          </label>

          <div className="navpanel">
            <nav className="menu">
              <a href="#">
                <span id="about">About</span>
              </a>
              <a href="#">
                <span id="product">Product</span>
              </a>
              <a href="#">
                <span id="solutions">Solutions</span>
                <svg className="caret" viewBox="0 0 9 6" aria-hidden="true">
                  <path d="M0.7 1.1 L4.5 4.6 L8.3 1.1" />
                </svg>
              </a>
            </nav>
            <a className="login" href="#">
              <span id="login">Log in / Request access</span>
              <svg className="navarrow" viewBox="0 0 10 9" aria-hidden="true">
                <path d="M0 4.5 H9.1 M5.4 0.9 L9.2 4.5 L5.4 8.1" />
              </svg>
            </a>
            <a className="pill" href="#">
              <span id="contact">Contact sales</span>
            </a>
          </div>
        </header>

        {/* 4) Hero Section */}
        <main className="hero">
          <h1 className="title">
            <span id="h1a">World-Class Digital Products</span>
            <span id="h1b">Work on Time, Right on Target.</span>
          </h1>
          <p className="sub">
            <span id="sub1">We build extraordinary products</span>
            <span id="sub2">for ambitious teams.</span>
          </p>
          <a className="cta" href="#">
            <span id="cta">Get started today</span>
            <svg className="arrow" viewBox="0 0 16 11" aria-hidden="true">
              <path d="M0 5.5 H14.6 M10.3 1.2 L14.9 5.5 L10.3 9.8" />
            </svg>
          </a>
          <ul className="feats">
            <li>
              <svg className="chev" viewBox="0 0 11 20" aria-hidden="true">
                <path d="M1.15 1.15 L9.6 10 L1.15 18.85" />
              </svg>
              <span id="f1">Strategic partner</span>
            </li>
            <li>
              <svg className="chev" viewBox="0 0 11 20" aria-hidden="true">
                <path d="M1.15 1.15 L9.6 10 L1.15 18.85" />
              </svg>
              <span id="f2">End-to-end delivery</span>
            </li>
            <li>
              <svg className="chev" viewBox="0 0 11 20" aria-hidden="true">
                <path d="M1.15 1.15 L9.6 10 L1.15 18.85" />
              </svg>
              <span id="f3">Long-term impact</span>
            </li>
            <li>
              <svg className="chev" viewBox="0 0 11 20" aria-hidden="true">
                <path d="M1.15 1.15 L9.6 10 L1.15 18.85" />
              </svg>
              <span id="f4">Long-term impact</span>
            </li>
          </ul>
          <span className="rule" aria-hidden="true" />
        </main>

        {/* 5) Footer */}
        <footer className="foot">
          <span id="foot1">Trusted by innovative teams around the world.</span>
          <span id="foot2" ref={foot2Ref}>2024</span>
        </footer>
      </div>
    </>
  );
}
