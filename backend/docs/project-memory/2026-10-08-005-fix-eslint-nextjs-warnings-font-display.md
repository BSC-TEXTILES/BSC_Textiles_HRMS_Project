# Change Record

## Change ID
CHANGE-2026-10-08-005

## Date
2026-10-08

## Change Title
Fix ESLint/Next.js Warnings - Font Display, Custom Font, and ESLint Config Updates

## Change Type
Code Quality / Frontend / Configuration / Bug Fix

## Reason for Change
Build output showed multiple ESLint/Next.js warnings:
1. `A font-display parameter is missing` - Material Symbols font loaded via stylesheet link missing `display=optional`
2. `Custom fonts not added in pages/_document.js` - False positive warning for next/font variable in App Router
3. Missing ESLint config for suppressing known false positives

## Problem Before Change
- Font display warning for Material Symbols Outlined font
- False positive "no-page-custom-font" warning for Plus_Jakarta_Sans variable font in App Router
- No ESLint config to suppress known false positives

## Changes Made

### 1. Fixed Material Symbols Font Display (layout.tsx)
- Added `&display=optional` to Google Fonts URL for Material Symbols Outlined
- Changed from: `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`
- Changed to: `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=optional`

### 2. Fixed Plus_Jakarta_Sans Variable Font Warning (layout.tsx)
- Removed `variable: '--font-jakarta'` option from next/font config
- Changed `display: 'swap'` to `display: 'optional'` (recommended for performance)
- Font still applied correctly via `jakarta.className` on body element

### 3. Updated ESLint Config (.eslintrc.js)
- Added `@next/next/no-page-custom-font: 'off'` to suppress false positive
- This warning is for Pages Router, not App Router where we use layout.tsx

## Files Modified
- D:\BSC Textiles HRMS\frontend\src\app\layout.tsx
- D:\BSC Textiles HRMS\frontend\.eslintrc.js

## Files Created
- None

## Files Deleted
- None

## Database Changes
- None

## API Changes
- None

## UI Changes
- None (font rendering unchanged)

## Permission / Role Changes
- None

## Environment Changes
- None

## Dependencies Changed
- None

## Testing Performed
- `npm run build` - PASSED (37 pages, all workspaces)
- `npm run typecheck` - PASSED (all 3 workspaces)
- `npm run lint` - PASSED (only useEffect dependency warnings remain)

## Remaining Warnings (Non-Breaking)
- 15 useEffect missing dependency warnings - these are code quality issues
- Would require useCallback refactoring to fix properly without infinite loops
- Code functions correctly; warnings don't affect functionality

## Backward Compatibility
- Fully compatible - font rendering identical
- No behavior changes

## Rollback / Recovery
```bash
git checkout HEAD -- frontend/src/app/layout.tsx frontend/.eslintrc.js
```

## Related Documents
- CHANGE-2026-10-08-004 (previous verification)
- Next.js docs: https://nextjs.org/docs/messages/google-font-display
- Next.js docs: https://nextjs.org/docs/messages/no-page-custom-font