import { RouterProvider } from "react-router";
import { AppProviders } from "@/layouts/AppProviders";
import { router } from "@/routes/router";

const App = () => (
  <AppProviders>
    <RouterProvider router={router} />
  </AppProviders>
);

export default App;
