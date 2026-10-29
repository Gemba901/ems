import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/patterns/ConfirmDialog";
function Demo({ confirm }: { confirm: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open confirmation</button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete ticket?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={confirm}
      />
    </>
  );
}
test("cancel and Escape do not confirm, focus returns to opener", async () => {
  const user = userEvent.setup();
  const confirm = jest.fn();
  render(<Demo confirm={confirm} />);
  const opener = screen.getByRole("button", { name: "Open confirmation" });
  await user.click(opener);
  expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
    "Delete ticket?",
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(confirm).not.toHaveBeenCalled();
  await user.click(opener);
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(opener).toHaveFocus();
});
test("pending prevents duplicate confirmation and dismissal; success closes", async () => {
  const user = userEvent.setup();
  let resolve!: () => void;
  const confirm = jest.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  render(<Demo confirm={confirm} />);
  await user.click(screen.getByRole("button", { name: "Open confirmation" }));
  await user.dblClick(screen.getByRole("button", { name: "Delete" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog")).toBeVisible();
  resolve();
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
});
test("rejection stays open, exposes safe error and allows retry", async () => {
  const user = userEvent.setup();
  const confirm = jest
    .fn()
    .mockRejectedValueOnce(new Error("private server detail"))
    .mockResolvedValueOnce(undefined);
  render(<Demo confirm={confirm} />);
  await user.click(screen.getByRole("button", { name: "Open confirmation" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The action failed",
  );
  expect(screen.queryByText("private server detail")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(confirm).toHaveBeenCalledTimes(2);
});
