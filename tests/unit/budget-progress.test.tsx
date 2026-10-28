import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BudgetProgress } from "@/features/dashboard/components/budget-list";
import type { BudgetStatus } from "@/features/dashboard/types";

afterEach(cleanup);

const budget = (spent: number): BudgetStatus => ({
  budgetId: "b1",
  categoryName: "Ocio",
  limit: 600_000,
  spent,
  alertThreshold: 0.8,
});

function renderBar(spent: number, pace: number | null) {
  const { container } = render(
    <ul>
      <BudgetProgress budget={budget(spent)} pace={pace} currency="COP" locale="es-CO" />
    </ul>,
  );
  return { bar: screen.getByRole("progressbar"), container };
}

describe("BudgetProgress", () => {
  it("exposes value and expected pace to assistive tech", () => {
    const { bar, container } = renderBar(300_000, 0.47);
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect(bar.getAttribute("aria-label")).toMatch(/ritmo esperado hoy 47\s?%/);
    expect(container.querySelector('[data-slot="pace-marker"]')).not.toBeNull();
    expect(screen.getByText("Vas por delante de tu ritmo")).toBeTruthy();
  });

  it("uses the warning fill at the alert threshold and expense at 100 %", () => {
    expect(renderBar(500_000, 0.9).bar.firstElementChild?.className).toContain("bg-warning");
    cleanup();
    const { bar } = renderBar(720_000, 0.9);
    expect(bar.firstElementChild?.className).toContain("bg-expense");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toMatch(/120/);
  });

  it("hides the pace marker for a future month", () => {
    const { bar, container } = renderBar(0, null);
    expect(container.querySelector('[data-slot="pace-marker"]')).toBeNull();
    expect(bar.getAttribute("aria-label")).not.toMatch(/ritmo/);
  });
});
