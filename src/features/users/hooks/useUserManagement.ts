// Re-export thin facade: data y mutaciones viven en archivos dedicados;
// el error de validación de contraseña vive en lib/.
export { PasswordValidationError } from "@/features/users/lib/PasswordValidationError";
export { useUsersWithRoles, type UserRow } from "./users/useUsersQuery";
export {
  useUpdateRole, useUpdateName, useInviteUser,
  useDeleteUser, useResetPassword, useToggleStatus,
} from "./users/useUserMutations";
