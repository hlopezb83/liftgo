export function useNavigateTransition() { return () => { throw new Error("Fixture read-only: navigation blocked"); }; }
export function useLocation() { return { pathname: "/customers/fixture", search: "", hash: "", state: null }; }
