import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";
import {
  consumeBlockedNetworkAttempts,
  NETWORK_BLOCKED_MESSAGE,
} from "./setup.node";

export { consumeBlockedNetworkAttempts, NETWORK_BLOCKED_MESSAGE };

expect.extend(matchers);

interface MatchMediaMock {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: () => void;
  removeListener: () => void;
  addEventListener: () => void;
  removeEventListener: () => void;
  dispatchEvent: () => void;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string): MatchMediaMock => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
