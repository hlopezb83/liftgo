import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AppProviders } from "@/layouts/AppProviders";
import { AuthGuard } from "@/layouts/AuthGuard";
import { appRoutes, PageFallback } from "@/lib/routes-config";
import { RoleGuard } from "@/layouts/RoleGuard";
import MainLayout from "@/layouts/MainLayout";


const PortalLogin = lazy(() => import("@/features/portal/pages/PortalLogin"));
const NotFound = lazy(() => import("./features/system/pages/NotFound"));

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
                    <RoleGuard module={module}>
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
