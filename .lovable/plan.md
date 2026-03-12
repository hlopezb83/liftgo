

## Fix DetailPageHeader Back Button Behavior

### Problem
The back button in `DetailPageHeader` currently uses `window.history.length > 1 ? navigate(-1) : navigate(backTo)`, which makes it behave like a browser back button. When users navigate from the fleet list to a forklift detail, then click back, they expect to return to `/fleet` (preserving any filters would be ideal, but currently the browser back doesn't guarantee that).

### Solution
Change the button to always navigate to the `backTo` route instead of using browser history.

### Changes

**File: `src/components/DetailPageHeader.tsx`**

Change line 20 from:
```tsx
<Button variant="ghost" size="icon" onClick={() => window.history.length > 1 ? navigate(-1) : navigate(backTo)}>
```

To:
```tsx
<Button variant="ghost" size="icon" onClick={() => navigate(backTo)}>
```

This ensures the back button always takes the user to the specified list page (e.g., `/fleet`) regardless of navigation history.

### Impact
- All pages using `DetailPageHeader` (forklift detail, customer detail, invoice detail, etc.) will now consistently navigate to their respective list pages when clicking the back button.
- Users won't get unexpected navigation when they arrived at the detail page from a different source (e.g., dashboard link).

