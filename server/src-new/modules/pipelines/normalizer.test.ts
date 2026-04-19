import { describe, it, expect } from "vitest";
import { detectSource, mapStatus } from "./normalizer.js";

describe("detectSource", () => {
  it("detects GitHub", () => {
    expect(detectSource({ "x-github-event": "workflow_run" })).toBe("github");
  });
  it("detects GitLab", () => {
    expect(detectSource({ "x-gitlab-event": "Pipeline Hook" })).toBe("gitlab");
  });
  it("detects Bitbucket", () => {
    expect(detectSource({ "x-event-key": "repo:push" })).toBe("bitbucket");
  });
  it("detects Jenkins via x-jenkins-event", () => {
    expect(detectSource({ "x-jenkins-event": "build" })).toBe("jenkins");
  });
  it("detects Jenkins via x-jenkins-url", () => {
    expect(detectSource({ "x-jenkins-url": "http://ci.example.com" })).toBe("jenkins");
  });
  it("returns null for unknown", () => {
    expect(detectSource({ "content-type": "application/json" })).toBeNull();
  });
});

describe("mapStatus", () => {
  it("maps success variants", () => {
    expect(mapStatus("success")).toBe("success");
    expect(mapStatus("completed")).toBe("success");
    expect(mapStatus("passed")).toBe("success");
    expect(mapStatus("FIXED")).toBe("success");
  });
  it("maps failure variants", () => {
    expect(mapStatus("failure")).toBe("failure");
    expect(mapStatus("FAILED")).toBe("failure");
    expect(mapStatus("broken")).toBe("failure");
    expect(mapStatus("error")).toBe("failure");
  });
  it("maps cancelled variants", () => {
    expect(mapStatus("cancelled")).toBe("cancelled");
    expect(mapStatus("canceled")).toBe("cancelled");
    expect(mapStatus("aborted")).toBe("cancelled");
  });
  it("maps running variants", () => {
    expect(mapStatus("running")).toBe("running");
    expect(mapStatus("in_progress")).toBe("running");
    expect(mapStatus("building")).toBe("running");
    expect(mapStatus("pending")).toBe("running");
  });
  it("maps unknown to pending", () => {
    expect(mapStatus("something_else")).toBe("pending");
  });
});
