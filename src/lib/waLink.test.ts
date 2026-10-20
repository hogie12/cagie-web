import { describe, expect, it } from "vitest";
import { formatRemaining, waMeLink } from "./waLink";

describe("waMeLink", () => {
  it("keeps digits only and pre-fills the link command", () => {
    expect(waMeLink("+62 812-3456-789", "ABC234")).toBe("https://wa.me/628123456789?text=%2Flink%20ABC234");
  });
  it("is empty without a number", () => {
    expect(waMeLink("", "ABC234")).toBe("");
    expect(waMeLink(undefined, "ABC234")).toBe("");
  });
});

describe("formatRemaining", () => {
  it("formats m:ss and never goes negative", () => {
    expect(formatRemaining(600_000)).toBe("10:00");
    expect(formatRemaining(61_500)).toBe("1:01");
    expect(formatRemaining(-5)).toBe("0:00");
  });
});
