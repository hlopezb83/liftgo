

# Add "Invite User" to User Management

## Problem

The User Management page currently only lists existing users and allows role changes. There is no way to add (invite) new staff users. An existing `invite-customer` edge function exists but is limited to customer portal invites.

## Solution

Add an "Invite User" dialog to the User Management page that lets admins create new staff accounts by entering a name, email, and role. A new backend function will handle user creation securely using the service role key (similar to the existing `invite-customer` function).

## Changes

### 1. New backend function: `invite-user`

Create `supabase/functions/invite-user/index.ts` that:

- Verifies the caller is an admin (same pattern as `invite-customer`)
- Accepts `email`, `full_name`, and `role` (admin / dispatcher / mechanic)
- Creates the auth user with a temporary password and email auto-confirmed
- Inserts a profile and user_role record
- Returns the new user ID

### 2. Update `src/pages/UserManagementPage.tsx`

- Add an "Invite User" button in the `PageHeader` action slot
- Add a `Dialog` containing a simple form with three fields:
  - Full Name (text input)
  - Email (text input)
  - Role (select: admin, dispatcher, mechanic)
- On submit, call the `invite-user` edge function
- On success, invalidate the users query and close the dialog
- Show toast feedback for success/error

### 3. Fix console warning

The `Badge` component inside `SelectItem` triggers a React ref warning. Wrap the badge text in a plain `span` with badge-like styling instead, or remove the `Badge` wrapper inside `SelectItem` since Radix passes a ref that `Badge` (a function component) cannot accept.

## Files

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/functions/invite-user/index.ts` | Backend function to create staff users securely |
| Modify | `src/pages/UserManagementPage.tsx` | Add invite dialog, fix Badge ref warning |

