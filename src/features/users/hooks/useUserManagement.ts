// Re-export thin facade: data y mutaciones viven en archivos dedicados;
// el error de validación de contraseña vive en lib/.
export { PasswordValidationError } from "../lib/PasswordValidationError";
export { useUsersWithRoles, type UserRow } from "./users/useUsersQuery";
export { useUpdateRole, useUpdateName } from "./users/useUserMutations";
export {
  useInviteUser, useDeleteUser, useResetPassword, useToggleStatus,
} from "./users/useUserAdminMutations";
