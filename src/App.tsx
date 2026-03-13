import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProviders } from "@/components/AppProviders";
import { AuthGuard } from "@/components/AuthGuard";
import { AppRoutes, PortalLoginRoute, PageFallback } from "@/routes";

const MainLayout = lazy(() => import("./layouts/MainLayout"));

const App = () => (
  <AppProviders>
    <BrowserRouter>
      <Routes>
        <PortalLoginRoute />
        <Route element={<AuthGuard><MainLayout /></AuthGuard>}>
          <AppRoutes />
        </Route>
      </Routes>
    </BrowserRouter>
  </AppProviders>
);

export default App;
