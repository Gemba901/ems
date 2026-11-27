import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListPageTemplate } from "@/components/templates/ListPageTemplate";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { FormPageTemplate } from "@/components/templates/FormPageTemplate";
import { DashboardPageTemplate } from "@/components/templates/DashboardPageTemplate";
import { FormField } from "@/components/patterns/FormField";
import { Input } from "@/components/ui/input";
test("list composes one filter bar, sorting/search and caller actions without module fetching", async () => {
  const user = userEvent.setup();
  const view = jest.fn();
  render(
    <ListPageTemplate
      header={{ title: "Tickets", actions: <button>Create</button> }}
      beforeTable={<p>List help</p>}
      afterTable={<p>Footer</p>}
      table={{
        caption: "Tickets list",
        rows: [
          { id: "1", subject: "Printer" },
          { id: "2", subject: "Scanner" },
        ],
        getRowId: (r) => r.id,
        searchText: (r) => r.subject,
        columns: [
          {
            id: "subject",
            header: "Subject",
            cell: (r) => r.subject,
            sortValue: (r) => r.subject,
          },
        ],
        rowActions: (r) => (
          <button onClick={() => view(r.id)}>View {r.id}</button>
        ),
      }}
    />,
  );
  expect(screen.getAllByRole("search")).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Tickets",
  );
  await user.type(screen.getByRole("searchbox"), "scanner");
  expect(screen.queryByText("Printer")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View 2" }));
  expect(view).toHaveBeenCalledWith("2");
  expect(screen.getByText("Footer")).toBeVisible();
});
test("detail provides status, labelled sidebar and timeline; omitted sidebar leaves only main content", () => {
  const { rerender } = render(
    <DetailPageTemplate
      header={{ title: "T-1" }}
      status="RESOLVED"
      details={[{ label: "Owner", value: "Support" }]}
      activity={[
        {
          id: "1",
          title: "Created",
          dateTime: "2026-10-29",
          timeLabel: "Today",
        },
      ]}
      sidebar={<p>Additional information</p>}
    >
      <p>Request body</p>
    </DetailPageTemplate>,
  );
  expect(screen.getByText("Resolved")).toHaveAttribute(
    "data-variant",
    "success",
  );
  const aside = screen.getByRole("complementary", {
    name: "Record information",
  });
  expect(within(aside).getByText("Support")).toBeVisible();
  expect(within(aside).getByText("Today")).toHaveAttribute(
    "datetime",
    "2026-10-29",
  );
  rerender(
    <DetailPageTemplate header={{ title: "T-1" }}>
      <p>Request body</p>
    </DetailPageTemplate>,
  );
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
});
test("form owns a single native form and sticky actions; submits and cancels independently", async () => {
  const user = userEvent.setup();
  const submit = jest.fn((e) => e.preventDefault());
  const cancel = jest.fn();
  render(
    <FormPageTemplate
      header={{ title: "Create ticket" }}
      onSubmit={submit}
      sections={[
        {
          id: "request",
          title: "Request",
          content: (
            <FormField label="Subject">
              <Input name="subject" />
            </FormField>
          ),
        },
      ]}
      actions={{ onCancel: cancel }}
    />,
  );
  const form = screen.getByRole("form", { name: "Create ticket" });
  expect(form.querySelectorAll("form")).toHaveLength(0);
  await user.type(screen.getByRole("textbox", { name: "Subject" }), "Repair");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(form.querySelector('[data-slot="sticky-form-actions"]')).toHaveClass(
    "sticky",
    "bottom-0",
  );
});
test("pending or disabled form rejects keyboard/programmatic submissions and announces errors", () => {
  const submit = jest.fn();
  const props = {
    header: { title: "Edit ticket" },
    onSubmit: submit,
    sections: [],
    error: "Save failed",
  };
  const { rerender } = render(
    <FormPageTemplate
      {...props}
      actions={{ pending: true, onCancel: jest.fn() }}
    />,
  );
  const form = screen.getByRole("form", { name: "Edit ticket" });
  expect(form).toHaveAttribute("aria-busy", "true");
  fireEvent.submit(form);
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
  rerender(<FormPageTemplate {...props} actions={{ disabled: true }} />);
  fireEvent.submit(form);
  expect(submit).not.toHaveBeenCalled();
});
test("dashboard renders metrics/charts, suppresses stale content on loading/error and retries", async () => {
  const retry = jest.fn();
  const props = {
    header: { title: "Overview" },
    stats: [{ id: "open", label: "Open", value: 0 }],
    charts: [
      {
        id: "volume",
        title: "Volume",
        categoryKey: "day",
        data: [],
        series: [],
      },
    ],
  };
  const { rerender } = render(
    <DashboardPageTemplate {...props}>
      <p>Recent activity</p>
    </DashboardPageTemplate>,
  );
  expect(screen.getByRole("region", { name: "Key metrics" })).toHaveTextContent(
    "0",
  );
  expect(screen.getByRole("region", { name: "Charts" })).toHaveTextContent(
    "No chart data",
  );
  rerender(<DashboardPageTemplate {...props} loading />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard");
  expect(screen.queryByText("Open")).not.toBeInTheDocument();
  rerender(
    <DashboardPageTemplate {...props} error="Offline" onRetry={retry} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
  rerender(
    <DashboardPageTemplate
      header={{ title: "Overview" }}
      stats={[]}
      charts={[]}
    />,
  );
  expect(screen.getByText("No dashboard data")).toBeVisible();
});
