import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageSection, SectionCard } from "@/components/patterns/PageSection";
import { StatCard } from "@/components/patterns/StatCard";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { DetailList } from "@/components/patterns/DetailList";
import { Timeline, ActivityFeed } from "@/components/patterns/Timeline";
import { ChartCard } from "@/components/patterns/ChartCard";
test("page/section semantics, actions and breadcrumbs", () => {
  render(
    <>
      <PageHeader
        title="Tickets"
        description="Support"
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Tickets" }]}
        actions={<button>Create</button>}
      />
      <PageSection title="Overview">Body</PageSection>
      <SectionCard title="Details">Content</SectionCard>
    </>,
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Tickets",
  );
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(screen.getByText("Tickets", { selector: "span" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("region", { name: "Overview" })).toHaveTextContent(
    "Body",
  );
  expect(screen.getByRole("button", { name: "Create" })).toBeVisible();
});
test("stats and status retain readable meaning, unknown statuses are neutral", () => {
  render(
    <>
      <StatCard
        label="Open"
        value={0}
        trend={{ label: "Down 2", tone: "success" }}
      />
      <StatusBadge status="IN_PROGRESS" />
      <StatusBadge status="novel" />
      <StatusBadge status={null} />
    </>,
  );
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.getByText("In progress")).toHaveAttribute(
    "data-variant",
    "info",
  );
  expect(screen.getByText("Novel")).toHaveAttribute("data-variant", "neutral");
  expect(screen.getByText("Unknown")).toBeVisible();
});
test("details preserve zero/false and replace missing values", () => {
  render(
    <DetailList
      items={[
        { label: "Count", value: 0 },
        { label: "Missing", value: null },
        { label: "Boolean", value: String(false) },
      ]}
    />,
  );
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.getByText("Not provided")).toBeVisible();
  expect(screen.getByText("false")).toBeVisible();
});
test("timeline and activity alias render supplied order and machine dates", () => {
  expect(ActivityFeed).toBe(Timeline);
  const { rerender } = render(<Timeline items={[]} />);
  expect(screen.getByText("No activity yet")).toBeVisible();
  rerender(
    <Timeline
      items={[
        {
          id: "1",
          title: "Approved",
          dateTime: "2026-10-29",
          timeLabel: "Today",
          actor: "Reviewer",
        },
      ]}
    />,
  );
  expect(
    screen.getByRole("list", { name: "Activity history" }),
  ).toHaveTextContent("Reviewer");
  expect(screen.getByText("Today")).toHaveAttribute("datetime", "2026-10-29");
});
test("chart states and accessible tabular alternative", () => {
  const props = {
    title: "Volume",
    categoryKey: "day",
    series: [{ key: "count", label: "Tickets", token: "chart-1" as const }],
    data: [{ day: "Mon", count: 3 }],
  };
  const { rerender } = render(<ChartCard {...props} loading />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading chart");
  rerender(<ChartCard {...props} error="Offline" />);
  expect(screen.getByRole("alert")).toHaveTextContent("Offline");
  rerender(<ChartCard {...props} data={[]} />);
  expect(screen.getByText("No chart data")).toBeVisible();
  rerender(<ChartCard {...props} />);
  expect(screen.getByText("View chart data")).toBeVisible();
  expect(screen.getByText("Mon")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});
