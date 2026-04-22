import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MetricCard from "./MetricCard";

describe("MetricCard", () => {
  it("renders title, value and subtitle", () => {
    render(<MetricCard title="CPU" value="42%" subtitle="cores: 8" />);
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("cores: 8")).toBeInTheDocument();
  });

  it("renders an upward trend indicator", () => {
    render(<MetricCard title="RAM" value="50%" trend={12.3} />);
    expect(screen.getByText(/↑ 12.3%/)).toBeInTheDocument();
  });

  it("renders a downward trend indicator for negatives", () => {
    render(<MetricCard title="RAM" value="50%" trend={-8} />);
    expect(screen.getByText(/↓ 8.0%/)).toBeInTheDocument();
  });
});
