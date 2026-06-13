import { useState } from "react";
import type { UserRow } from "../useUserManagement";
import type { AppRole } from "../useUserRole";

export function useUserManagementDialogs() {
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRow | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: UserRow; newRole: AppRole } | null>(null);

  return {
    deleteTarget, setDeleteTarget,
    editTarget, setEditTarget,
    passwordTarget, setPasswordTarget,
    createdEmail, setCreatedEmail,
    roleChangeTarget, setRoleChangeTarget,
  };
}
