import { useState } from "react";

export function useCustomerDetailDialogs() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return {
    inviteOpen, setInviteOpen,
    inviteEmail, setInviteEmail,
    editOpen, setEditOpen,
    deleteOpen, setDeleteOpen,
  };
}
