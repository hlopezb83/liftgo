

# Rebrand App to Match LiftGo Identity

## Overview

Transform the ForkliftERP app to reflect the LiftGo brand identity from liftgo.com.mx, updating colors, branding text, and the document title throughout the application.

## Brand Identity (from liftgo.com.mx)

| Element | Current App | LiftGo Brand |
|---------|-------------|---------------|
| Primary color | Orange (#F97316) | Dark Navy (#1B2A4A) |
| Accent/CTA color | Orange | Gold/Bronze (#B8964E) |
| Brand name | "ForkliftERP" | "Lift Go" |
| Logo initials | "FL" | "LG" |
| Tagline | "Fleet Management" | "Montacargas" |
| Page title | "Lovable App" | "Lift Go ERP" |

## Changes

### 1. Color Theme (`src/index.css`)

Update CSS custom properties in both light and dark modes:

- **Primary**: Change from orange `25 95% 53%` to dark navy `220 45% 20%`
- **Ring/focus**: Match new primary
- **Sidebar primary**: Update to gold accent `38 40% 50%`
- **Sidebar background**: Keep dark navy, refine values to match LiftGo's navy
- Add a new `--accent-gold` variable for CTA-style highlights

### 2. Branding Text and Logo

**`src/components/AppSidebar.tsx`**:
- Change logo initials from "FL" to "LG"
- Change title from "ForkliftERP" to "Lift Go"
- Change subtitle from "Fleet Management" to "Montacargas"
- Update logo background to use gold accent color

**`src/pages/AuthPage.tsx`**:
- Change logo initials from "FL" to "LG"
- Update logo styling to match navy/gold brand

**`src/components/AuthGuard.tsx`**:
- Update spinner color to match new primary

### 3. Document Title (`index.html`)

- Change `<title>` from "Lovable App" to "Lift Go ERP"
- Update `og:title` meta tag to "Lift Go ERP"
- Update `og:description` to "Lift Go - Montacargas ERP"

### 4. Customer Portal Header (`src/layouts/CustomerPortalLayout.tsx`)

- Update fallback logo initials from "P" to "LG"
- Update portal label to "Lift Go - Portal"

## Files to Modify

| File | Change |
|------|--------|
| `src/index.css` | Update color variables for navy/gold palette |
| `index.html` | Update page title and meta tags |
| `src/components/AppSidebar.tsx` | Logo initials, brand name, tagline |
| `src/pages/AuthPage.tsx` | Logo initials and styling |
| `src/components/AuthGuard.tsx` | Spinner color alignment |
| `src/layouts/CustomerPortalLayout.tsx` | Portal fallback logo and label |

No new files needed. No database or backend changes required.

