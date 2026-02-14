
# Promote Your Account to Admin

**What will change:** Your account (Hector Lopez) will be updated from "dispatcher" to "admin" in the database. This is a simple data update -- no code changes needed.

**After this change you will be able to:**
- Add, edit, and delete forklifts
- Access Equipment Config, User Management, and all other admin-only pages
- Full CRUD on all tables

## Technical Details

A single SQL update will be run against the `user_roles` table:

```text
UPDATE user_roles SET role = 'admin' WHERE user_id = '0ff06b40-...'
```

No file changes are required -- just a database data update.
