import { useNavigate } from "react-router";

/**
 * v7 Data Router envuelve automáticamente cada navegación en `startTransition`
 * y aplica Suspense de forma nativa, así que ya no necesitamos un wrapper
 * manual. Se conserva el nombre como alias para no romper los ~50 callsites.
 *
 *   const navigate = useNavigateTransition();
 *   navigate("/reports");
 *   navigate(-1);
 */
export const useNavigateTransition = useNavigate;
