import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fakeBackendEnv } from "./tests/design-group-c/paths";

// Isolated component fixture: real shared form primitives; only data hooks
// are replaced. No auth provider, backend client or application entry mounts.
const fixture = (file: string) => resolve("tests/design-group-c/component", file);
export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^\.\.\/hooks\/useRegisterSupplierPayment$/, replacement: fixture("paymentHooks.ts") },
      { find: /^\.\.\/hooks\/useUploadSupplierReceipt$/, replacement: fixture("paymentHooks.ts") },
      { find: "@/features/accounts-payable/hooks/useRegisterSupplierPayment", replacement: fixture("paymentHooks.ts") },
      { find: "@/features/accounts-payable/hooks/useUploadSupplierReceipt", replacement: fixture("paymentHooks.ts") },
      { find: "@/lib/ui/appFeedback", replacement: fixture("feedback.ts") },
      { find: "@/features/users", replacement: fixture("users.ts") },
      { find: "@/hooks/useNavigateTransition", replacement: fixture("navigation.ts") },
      { find: "@/lib/router-compat", replacement: fixture("navigation.ts") },
      { find: "@", replacement: resolve("src") },
    ],
  },
  define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(fakeBackendEnv.VITE_SUPABASE_URL), "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(fakeBackendEnv.VITE_SUPABASE_PUBLISHABLE_KEY) },
  server: { host: "127.0.0.1", port: 4194, strictPort: true },
});
