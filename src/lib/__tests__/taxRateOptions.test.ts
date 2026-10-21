import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../config";

describe("tax rate option labels", () => {
  it("describes the numeric zero rate without labelling it exempt", () => {
    expect(APP_CONFIG.TAX_RATE_OPTIONS.find(({ value }) => value === 0))
      .toEqual({ value: 0, label: "0% (Tasa cero)" });
  });

  it("offers current rates without silently substituting a border incentive", () => {
    expect(APP_CONFIG.TAX_RATE_OPTIONS.map(({ value }) => value)).toEqual([16, 0]);
    expect(APP_CONFIG.DEFAULT_TAX_RATE).toBe(16);
  });
});
