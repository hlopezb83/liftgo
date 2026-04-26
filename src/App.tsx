import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AppProviders } from "@/components/AppProviders";
import { AuthGuard } from "@/components/AuthGuard";
import { appRoutes, PageFallback } from "@/lib/routes-config";
import { RoleGuard } from "@/components/RoleGuard";
import MainLayout from "@/layouts/MainLayout";

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
                <Suspense fallback={<PageFallback />}>
                  {module ? (
                    <RoleGuard module={module} fallback={<NoAccess />}>
                      <Component />
                    </RoleGuard>
                  ) : (
                    <Component />
                  )}
                </Suspense>
              }
            />
          ))}
          <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFound /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AppProviders>
);

export default App;
