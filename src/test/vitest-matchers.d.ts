import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import "vitest";

// Vitest 5 separates matcher return and received types; jest-dom 7's /vitest
// entry still augments the older one-parameter Assertion interface.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars -- Module augmentation requires identical interface signature.
  interface Matchers<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
