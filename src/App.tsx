import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AppProviders } from "@/components/AppProviders";
import { AuthGuard } from "@/components/AuthGuard";
import { appRoutes, PageFallback } from "@/routes";
import { RoleGuard } from "@/components/RoleGuard";

const MainLayout = lazy(() => import("./layouts/MainLayout"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const NotFound = lazy(() => import("./pages/NotFound"));

const NoAccess = () => (
  <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
    No tienes permiso para acceder a esta página.
  </div>
);

const App = () => (
  <AppProviders>
    <BrowserRouter>
      <Routes>
        <Route path="/portal/login" element={<Suspense fallback={<PageFallback />}><PortalLogin /></Suspense>} />
        <Route element={<AuthGuard><MainLayout /></AuthGuard>}>
          {appRoutes.map(({ path, component: Component, module }) => (
            <Route
              key={path}
              path={path}
              element={
                module ? (
                  <RoleGuard module={module} fallback={<NoAccess />}>
                    <Component />
                  </RoleGuard>
                ) : (
                  <Component />
                )
              }
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AppProviders>
);

export default App;
