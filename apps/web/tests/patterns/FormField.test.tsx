import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/patterns/FormField";
import { FormSection } from "@/components/patterns/FormSection";
import { FormActions } from "@/components/patterns/FormActions";
import { Input } from "@/components/ui/input";
test("connects label, help and error, preserves child ref and handlers", async () => {
  const ref = createRef<HTMLInputElement>();
  const change = jest.fn();
  const { rerender } = render(
    <FormField label="Subject" description="Be brief" error="Required" required>
      <Input
        id="subject"
        ref={ref}
        onChange={change}
        aria-describedby="external"
      />
    </FormField>,
  );
  const input = screen.getByRole("textbox", { name: "Subject" });
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-required", "true");
  expect(input).toHaveAttribute(
    "aria-describedby",
    "external subject-help subject-error",
  );
  expect(ref.current).toBe(input);
  await userEvent.type(input, "a");
  expect(change).toHaveBeenCalledTimes(1);
  rerender(
    <FormField label="Subject">
      <Input id="subject" />
    </FormField>,
  );
  expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
function FormDemo({ save }: { save: (value: unknown) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ subject: string }>();
  return (
    <form onSubmit={handleSubmit(save)}>
      <FormSection title="Details">
        <FormField label="Subject" error={errors.subject?.message}>
          <Input
            {...register("subject", { required: "Subject is required" })}
          />
        </FormField>
      </FormSection>
      <FormActions />
    </form>
  );
}
test("works with RHF validation, focus and submit values", async () => {
  const user = userEvent.setup();
  const save = jest.fn();
  render(<FormDemo save={save} />);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Subject is required",
  );
  expect(screen.getByRole("textbox")).toHaveFocus();
  await user.type(screen.getByRole("textbox"), "Scanner broken");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(save).toHaveBeenCalledWith(
    { subject: "Scanner broken" },
    expect.anything(),
  );
});
test("pending disables cancellation and submission", () => {
  render(<FormActions pending onCancel={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Saving");
});
