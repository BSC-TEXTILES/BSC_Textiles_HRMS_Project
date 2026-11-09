---
name: Executive Textile Atelier
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#2f1500'
  on-tertiary-container: '#c76c00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style
The design system articulates an executive, institutional aesthetic tailored for modern multi-location textile manufacturing and luxury retail operations. It combines the rigorous operational clarity of an enterprise ERP with the understated luxury of fine fabric craft.

The visual style is **Corporate Modern with Tactile Textile Nuances**:
- **Personality:** Authoritative, immaculate, dependable, and discreetly luxurious. It balances high-velocity operational utilities (roster allocations, floor shifts, biometric logs) with boardroom-ready executive intelligence.
- **Audience:** Plant supervisors across production hubs (Belagavi, Davanagere, Shivamogga), regional retail managers, HR directors, and C-suite executives who inspect unit economics, overtime leakages, and workforce lifecycle metrics.
- **Emotional Response:** Inspires absolute structural trust, order, and quiet prestige. Interactions are sharp, responsive, and free of visual noise or whimsical micro-animations.

## Colors
The palette leverages deep structural indigos, calibrated tech blues, and artisanal textile accents to communicate prestige alongside crisp transactional utility.

- **Primary (`#0F172A` - Midnight Slate / Obsidian Indigo):** Used for structural navigation, master headers, high-level KPIs, and dominant action buttons. Conveys authority and bedrock stability.
- **Secondary (`#3B82F6` - Precision Cobalt):** The functional engine of the interface. Applied to interactive links, primary tab underlines, selected row states, and active workflow triggers.
- **Tertiary (`#D97706` - Warm Raw Silk Amber):** Evoking heritage spun gold and raw zari thread. Reserved for executive alerts, pending attendance verifications, contract renewals, and tier badges.
- **Neutral (`#64748B` - Slate Neutral):** Powers secondary data labels, subtle cell dividers, search placeholder texts, and de-emphasized metadata.

### Semantic & Domain Extensions
- **Operational Success & Presenteeism (`#059669` - Mill Emerald):** Applied to on-time biometric clock-ins, disbursed payroll statuses, and compliant factory floor headcounts.
- **Discrepancy & Overtime Hazard (`#DC2626` - Crimson Dye):** Applied to unexcused absences, biometric mismatches, and compliance violations.
- **Surface Foundations:** Background canvas runs on `#F8FAFC`, nested card containers on `#FFFFFF`, with crisp `#E2E8F0` micro-borders ensuring zero bleeding across high-density data tables.

## Typography
Plus Jakarta Sans delivers structural balance: its geometric foundational stems ensure clarity in data tables, while clean counters bring modern warmth to executive reporting.

- **Tabular Numerics:** Enable `font-variant-numeric: tabular-nums` across all attendance grids, hourly wages, and shift rosters to eliminate visual jitter across column comparisons.
- **Label Hierarchy:** Micro-labels (`label-sm` and `label-md`) use uppercase formatting with tracked spacing (`+0.04em` to `+0.06em`) for factory shift designations (e.g., `SH-01 BELAGAVI`, `WEAVE-D2`) and ledger categories.
- **Headline Discipline:** Display levels are locked to compact line-heights, ensuring high-density dashboards showcase maximum relevant operational data above the fold.

## Layout & Spacing
The layout model employs a responsive 12-column fluid grid system pinned inside an enterprise container structure.

### Canvas Partitioning
- **Global Shell:** Permanent 260px condensed navigation rail pinned to the left, expandable to 280px for deep departmental trees; sticky 56px global utility bar across the top.
- **Main Viewport:** Fluid 12-column core with `1rem` gutters on mid-screens, expanding to `1.5rem` on wide displays (`≥1440px`). Outer screen padding enforces a strict `1.5rem` to `2rem` boundary margin.
- **High-Density Table Regions:** Enforce vertical row padding of `0.5rem` (`space-sm`) and horizontal cell padding of `0.75rem` (`space-md`) to ensure high row visibility (15–20 rows viewable per standard laptop display).
- **Executive Profile Drawer:** A 480px sliding right-hand drawer model for deep employee records, ensuring the underlying roster list retains context without page hops.

## Elevation & Depth
Depth is established primarily via razor-sharp, low-contrast structural outlines combined with tinted ambient drop shadows. This prevents the "muddy" appearance common in heavy dashboard software.

- **Surface Tiers:**
  - **Canvas Base:** `#F8FAFC` (Pure matte operational foundation).
  - **Cards & Data Wells:** `#FFFFFF` surrounded by a `1px` solid outline in `#E2E8F0`.
  - **Active Dropdown Panels & Flyouts:** `#FFFFFF` bordered in `#CBD5E1` with `box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)`.
  - **Sliding Drawers & Executive Overlays:** Elevated over a calibrated `#0F172A` backdrop dimmed to 40% opacity, utilizing `box-shadow: -8px 0 28px -4px rgba(15, 23, 42, 0.12)`.
- **Card Separations:** Avoid stacked floating shadows. Grouped panels rely on contiguous borders (`border-t-0` with adjacent dividers) to maintain high data density.

## Shapes
The design system adopts a **Soft (Level 1)** structural rounding philosophy. 

- **Structural Elements:** Core dashboard cards, nested grid tiles, input forms, and data tables standardize on `0.25rem` (4px) to `0.375rem` (6px) corner radiuses. This clean, architectural edge reflects industrial machinery, woven cloth bolts, and enterprise order.
- **Pill Exception for Badges & Status Tokens:** Status chips (`Present`, `Shift Lead`, `Overtime Approved`, `Belagavi Retail`) employ fully rounded pill edges (`9999px`) to immediately separate qualitative state trackers from geometric, quantitative data containers.
- **Segmented Controls:** Enclosed pill-track or 4px subtle rounded tabs within bordered hulls.

## Components

### Buttons
- **Primary Action:** Solid `#0F172A` fill with `#FFFFFF` text, `border-radius: 4px`, padding `0.5rem 1rem`. Active hover shifts to `#1E293B` with smooth 150ms ease. Focus states feature a crisp `2px` offset ring in `#3B82F6`.
- **Secondary Action:** Crisp `#FFFFFF` surface with `1px solid #CBD5E1` border, `#0F172A` text. Hover triggers `#F1F5F9` background.
- **Textile Accent / Special Trigger:** Solid `#D97706` fill with `#FFFFFF` text for executive approvals, roster releases, and payroll dispatches.

### High-Density Data Tables
- **Header:** Background `#F8FAFC`, uppercase `label-sm` font, tracking `0.05em`, color `#64748B`, with explicit `1px solid #E2E8F0` bottom edge.
- **Rows:** Alternating subtle hover `#F1F5F9`. Cell padding `8px 12px`. Cells contain monospaced numeric values where metrics appear.
- **Sticky Column:** Fixed left column for Employee ID & Profile Photo Avatar with right vertical border in `#E2E8F0`.

### Status Pills & Chips
- **Present / Clocked-In:** `#ECFDF5` surface, `#059669` typography, accompanied by a 6px circular `#10B981` status dot.
- **On Leave / In Review:** `#FFFBEB` surface, `#B45309` typography.
- **Absent / Biometric Issue:** `#FEF2F2` surface, `#B91C1C` typography.
- **Location Tag:** `#EFF6FF` background with `#1D4ED8` border and text (`Belagavi Plant`, `Shivamogga Store`).

### Interactive Tabs
- Flat baseline layout with a continuous `1px solid #E2E8F0` rule.
- Active tab features bold `label-lg` text in `#0F172A` with an absolute `2px` bottom border in `#3B82F6`. Inactive tabs render in `#64748B` with hover color change to `#334155`.

### Refined Stats Cards
- Clean `#FFFFFF` panels bounded by `1px solid #E2E8F0`.
- Top row hosts an icon enclosed in an architectural tinted square (`36px x 36px`, `4px` radius) followed by uppercase `label-md` descriptive title.
- Core value set in `headline-lg` (`24px` bold) alongside micro trend badges (e.g., `+4.2% Attendance vs Target` in Mill Emerald pill).

### Input Fields & Selects
- Height fixed at `36px` for dense data entry; `1px solid #CBD5E1` border on `#FFFFFF` ground.
- Typographic scale uses `body-md` (`13px`). Focus locks to a solid `#3B82F6` hairline border and a faint `3px` cobalt focus blur (`rgba(59, 130, 246, 0.15)`).

### Employee Profile Panels (Side Drawers)
- Top banner showcases employee tier, biometric identity code, and branch location badge (`Davanagere Hub`).
- Two-column structured specification grid displaying shift rules, ESIC/PF account flags, and current day biometric timestamps with real-time floor status indicators.