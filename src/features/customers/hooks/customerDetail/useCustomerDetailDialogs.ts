import { useState } from "react";

export function useCustomerDetailDialogs() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return {
    inviteOpen, setInviteOpen,
    editOpen, setEditOpen,
    deleteOpen, setDeleteOpen,
  };
}
