// Re-export thin facade: data y mutaciones viven en archivos dedicados.
export { useUsersWithRoles, type UserRow } from "./users/useUsersQuery";
export { useUpdateRole, useUpdateName } from "./users/useUserMutations";
export {
  useInviteUser, useDeleteUser, useResetPassword, useToggleStatus,
} from "./users/useUserAdminMutations";
