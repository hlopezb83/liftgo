

# Add a Dedicated Customer Login Page

## Overview
Create a separate login page specifically for customers at `/portal/login`, with a distinct look that makes it clear they're accessing the Customer Portal. The main staff login page will also get a link pointing customers to their dedicated login.

## What Changes

### 1. New Customer Login Page (`src/pages/portal/PortalLogin.tsx`)
- A standalone login page at `/portal/login` branded as "Customer Portal"
- Only shows sign-in and forgot password flows (no sign-up -- customers are invited by admins)
- After login, the existing `AuthGuard` automatically routes customer-role users to the portal

### 2. Update Main Auth Page (`src/pages/AuthPage.tsx`)
- Add a small link at the bottom: "Are you a customer? Sign in to the Customer Portal" that links to `/portal/login`

### 3. Update Routing (`src/App.tsx`)
- Add the `/portal/login` route outside the `AuthGuard` so it's accessible without being logged in

## Technical Details

### PortalLogin.tsx
- Reuses the existing `useAuth` hook for `signIn` and `resetPassword`
- Two modes: "sign-in" and "forgot"
- On successful login, navigates to `/portal` (AuthGuard handles the rest)
- Styled with a different accent/header to distinguish from staff login

### Routing Change
- The `/portal/login` route is placed before `AuthGuard` in `App.tsx` so unauthenticated users can access it
- If an already-authenticated customer navigates to `/portal/login`, they get redirected to `/portal`

### Files to Create
| File | Purpose |
|------|---------|
| `src/pages/portal/PortalLogin.tsx` | Customer-facing login page |

### Files to Modify
| File | Change |
|------|--------|
| `src/App.tsx` | Add `/portal/login` route before AuthGuard |
| `src/pages/AuthPage.tsx` | Add "Customer Portal" link |

