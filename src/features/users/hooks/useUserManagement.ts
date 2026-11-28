// Re-export thin facade: data y mutaciones viven en archivos dedicados.
export { useUsersWithRoles, type UserRow } from "./useUsersQuery";
export { useUpdateRole, useUpdateName } from "./useUserMutations";
export {
  useInviteUser, useDeleteUser, useResetPassword, useToggleStatus,
} from "./useUserAdminMutations";
