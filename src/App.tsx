import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AppProviders } from "@/layouts/AppProviders";
import { AuthGuard } from "@/layouts/AuthGuard";
import { appRoutes, PageFallback } from "@/routes/routes-config";
import { RoleGuard } from "@/layouts/RoleGuard";
import { AdminRouteGuard } from "@/layouts/AdminRouteGuard";
import MainLayout from "@/layouts/MainLayout";
import { RouteErrorBoundary } from "@/layouts/RouteErrorBoundary";


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
