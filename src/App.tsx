import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AdminRouteGuard } from "@/layouts/AdminRouteGuard";
import { AppProviders } from "@/layouts/AppProviders";
import { AuthGuard } from "@/layouts/AuthGuard";
import MainLayout from "@/layouts/MainLayout";
import { RoleGuard } from "@/layouts/RoleGuard";
import { RouteErrorBoundary } from "@/layouts/RouteErrorBoundary";
import { appRoutes, PageFallback } from "@/routes/routes-config";


const PortalLogin = lazy(() => import("@/features/portal/pages/PortalLogin"));
const NotFound = lazy(() => import("./features/system/pages/NotFound"));

const App = () => (
  <AppProviders>
    <BrowserRouter>
      <Routes>
        <Route
          path="/portal/login"
          element={
            <RouteErrorBoundary>
              <Suspense fallback={<PageFallback />}>
                <PortalLogin />
              </Suspense>
            </RouteErrorBoundary>
          }
        />
        <Route element={<AuthGuard><MainLayout /></AuthGuard>}>
          {/* Redirect legacy /expenses → /cuentas-por-pagar sin cargar chunk. */}
          <Route path="/expenses" element={<Navigate to="/cuentas-por-pagar" replace />} />
          {appRoutes.map(({ path, component: Component, module, adminOnly }) => {
            const guarded = module ? (
              <RoleGuard module={module}>
                <Component />
              </RoleGuard>
            ) : (
              <Component />
            );
            const element = adminOnly ? (
              <AdminRouteGuard module={module}>{guarded}</AdminRouteGuard>
            ) : (
              guarded
            );
            return (
              <Route
                key={path}
                path={path}
                element={
                  <RouteErrorBoundary>
                    <Suspense fallback={<PageFallback />}>{element}</Suspense>
                  </RouteErrorBoundary>
                }
              />
            );
          })}
          <Route
            path="*"
            element={
              <RouteErrorBoundary>
                <Suspense fallback={<PageFallback />}>
                  <NotFound />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </AppProviders>
);

export default App;
