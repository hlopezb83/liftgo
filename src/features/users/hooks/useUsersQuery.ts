import { useQuery } from "@tanstack/react-query";
import { userQueries } from "../lib/userListQueries";
import type { UserRow, UsersFilter } from "../lib/queryKeys";

export type { UserRow };

export function useUsersWithRoles(filter?: UsersFilter) {
  return useQuery(userQueries.list(filter));
}
