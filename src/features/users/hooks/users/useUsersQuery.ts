import { useQuery } from "@tanstack/react-query";
import { userQueries, type UserRow, type UsersFilter } from "../../lib/queryKeys";

export type { UserRow };

export function useUsersWithRoles(filter?: UsersFilter) {
  return useQuery(userQueries.list(filter));
}
