import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "@/components/patterns/DataTable";
const rows = [
  { id: "1", name: "Charlie", status: "OPEN", date: "2026-10-27" },
  { id: "2", name: "Alpha", status: "RESOLVED", date: "2026-10-28" },
  { id: "3", name: "Bravo", status: "OPEN", date: "2026-10-29" },
];
const columns = [
  {
    id: "name",
    header: "Name",
    cell: (r: (typeof rows)[number]) => r.name,
    sortValue: (r: (typeof rows)[number]) => r.name,
  },
];
const props = {
  caption: "Tickets",
  rows,
  columns,
  getRowId: (r: (typeof rows)[number]) => r.id,
  pageSize: 2,
  searchText: (r: (typeof rows)[number]) => r.name,
};
test("sorts both ways, paginates and resets page on search", async () => {
  const user = userEvent.setup();
  render(<DataTable {...props} />);
  expect(screen.getByText("Charlie")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Bravo")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Name" }));
  expect(screen.getByText("Alpha")).toBeVisible();
  expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader")).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await user.click(screen.getByRole("button", { name: "Name" }));
  expect(screen.getByText("Charlie")).toBeVisible();
  await user.type(screen.getByRole("searchbox"), "  alpha ");
  expect(screen.getByText("Alpha")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByText("Charlie")).toBeVisible();
});
test("combines status and inclusive dates and resets all filters", async () => {
  const user = userEvent.setup();
  render(
    <DataTable
      {...props}
      dateRange
      filters={[
        {
          id: "status",
          label: "Status",
          options: [{ value: "OPEN", label: "Open" }],
        },
      ]}
      matchesFilters={(r, v) =>
        (!v.filters.status || r.status === v.filters.status) &&
        (!v.from || r.date >= v.from) &&
        (!v.to || r.date <= v.to)
      }
    />,
  );
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
    "All",
  );
  await user.click(screen.getByRole("combobox", { name: "Status" }));
  await user.click(await screen.findByRole("option", { name: "Open" }));
  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
    "Open",
  );
  fireEvent.change(screen.getByLabelText("From date"), {
    target: { value: "2026-10-29" },
  });
  expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  expect(screen.getByText("Bravo")).toBeVisible();
  fireEvent.change(screen.getByLabelText("To date"), {
    target: { value: "2026-10-28" },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("End date");
  expect(screen.getByText("No matching records")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByText("Alpha")).toBeVisible();
});
test("clamps page when data shrinks, handles page size zero and row actions", async () => {
  const user = userEvent.setup();
  const action = jest.fn();
  const { rerender } = render(
    <DataTable
      {...props}
      rowActions={(r) => (
        <button onClick={() => action(r.id)}>View {r.name}</button>
      )}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  rerender(
    <DataTable
      {...props}
      rows={[rows[0]]}
      pageSize={0}
      rowActions={(r) => (
        <button onClick={() => action(r.id)}>View {r.name}</button>
      )}
    />,
  );
  await user.click(screen.getByRole("button", { name: "View Charlie" }));
  expect(action).toHaveBeenCalledWith("1");
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
});
test("loading/error replace stale rows, retry and empty states work", async () => {
  const retry = jest.fn();
  const { rerender } = render(<DataTable {...props} loading />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  rerender(
    <DataTable {...props} error="Network unavailable" onRetry={retry} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledTimes(1);
  rerender(<DataTable {...props} rows={[]} />);
  expect(screen.getByText("No matching records")).toBeVisible();
  expect(within(screen.getByRole("table")).queryAllByRole("cell")).toHaveLength(
    0,
  );
});
test("numeric sorting preserves input and filter-only tables omit search", async () => {
  const user = userEvent.setup();
  const data = Object.freeze([
    { id: "a", amount: 10 },
    { id: "b", amount: 2 },
    { id: "c", amount: null },
  ]);
  render(
    <DataTable
      caption="Amounts"
      rows={data}
      getRowId={(r) => r.id}
      columns={[
        {
          id: "amount",
          header: "Amount",
          cell: (r) => r.amount ?? "Missing",
          sortValue: (r) => r.amount,
        },
      ]}
      filters={[{ id: "kind", label: "Kind", options: [] }]}
      matchesFilters={() => true}
    />,
  );
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Amount" }));
  const cells = screen.getAllByRole("cell");
  expect(cells.map((c) => c.textContent)).toEqual(["2", "10", "Missing"]);
  expect(data.map((r) => r.id)).toEqual(["a", "b", "c"]);
});
