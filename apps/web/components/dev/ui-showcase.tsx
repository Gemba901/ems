"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { TemplateShowcase } from "./template-showcase";
import { PatternShowcase } from "./pattern-showcase";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, LoaderCircle, Plus } from "lucide-react";
import { statusToTone } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableFooter,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuShortcut,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { CoverCard, CoverCardGrid } from "@/components/ui/CoverCard";
import { FinancialImpact } from "@/components/ui/FinancialImpact";
import LinkedRecordChip from "@/components/ui/LinkedRecordChip";
// This legacy control detects browser speech support during its initial render.
const SpeechToTextButton = dynamic(
  () =>
    import("@/components/ui/SpeechToTextButton").then(
      (module) => module.SpeechToTextButton,
    ),
  { ssr: false },
);

const schema = z.object({
  title: z.string().min(3, "Enter at least 3 characters"),
  description: z.string().min(10, "Enter at least 10 characters"),
  department: z.string().min(1, "Choose a department"),
  accepted: z.boolean().refine(Boolean, "Accept the example terms"),
  priority: z.string().min(1, "Choose a priority"),
  notifications: z.boolean(),
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="space-y-4 rounded-xl border border-border p-card"
    >
      <h2 className="text-section-title">{title}</h2>
      {children}
    </section>
  );
}

const swatches = [
  ["overlay", "bg-overlay text-background"],
  ["sidebar", "bg-sidebar text-sidebar-foreground"],
  ["sidebar primary", "bg-sidebar-primary text-sidebar-primary-foreground"],
  ["sidebar accent", "bg-sidebar-accent text-sidebar-accent-foreground"],
  ["sidebar border", "bg-sidebar-border text-foreground"],
  ["sidebar ring", "bg-sidebar-ring text-foreground"],
  ["background", "bg-background text-foreground"],
  ["foreground", "bg-foreground text-background"],
  ["primary", "bg-primary text-primary-foreground"],
  ["secondary", "bg-secondary text-secondary-foreground"],
  ["muted", "bg-muted text-muted-foreground"],
  ["accent", "bg-accent text-accent-foreground"],
  ["card", "bg-card text-card-foreground"],
  ["popover", "bg-popover text-popover-foreground"],
  ["destructive", "bg-destructive text-background"],
  ["border", "bg-border text-foreground"],
  ["input", "bg-input text-foreground"],
  ["ring", "bg-ring text-foreground"],
  ["chart-1", "bg-chart-1 text-background"],
  ["chart-2", "bg-chart-2 text-background"],
  ["chart-3", "bg-chart-3 text-background"],
  ["chart-4", "bg-chart-4 text-background"],
  ["chart-5", "bg-chart-5 text-background"],
  ["success", "bg-success text-success-foreground"],
  ["success subtle", "bg-success-subtle text-success"],
  ["warning", "bg-warning text-warning-foreground"],
  ["warning subtle", "bg-warning-subtle text-warning"],
  ["info", "bg-info text-info-foreground"],
  ["info subtle", "bg-info-subtle text-info"],
  ["danger", "bg-danger text-danger-foreground"],
  ["danger subtle", "bg-danger-subtle text-danger"],
  ["neutral", "bg-neutral text-neutral-foreground"],
  ["neutral subtle", "bg-neutral-subtle text-neutral"],
  ["Gemba navy", "bg-gemba-navy text-primary-foreground"],
  ["Gemba navy deep", "bg-gemba-navy-deep text-primary-foreground"],
  ["Gemba lime", "bg-gemba-lime text-foreground"],
  ["Gemba lime ink", "bg-gemba-lime-ink text-primary-foreground"],
  ["Gemba red", "bg-gemba-red text-foreground"],
  ["Gemba red ink", "bg-gemba-red-ink text-primary-foreground"],
] as const;

function ExampleForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      department: "",
      accepted: false,
      priority: "",
      notifications: true,
    },
  });
  return (
    <Form {...form}>
      <form
        aria-label="Example form"
        onSubmit={form.handleSubmit(() =>
          toast.success("Example form submitted"),
        )}
        className="grid max-w-xl gap-6"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>A short example title.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormDescription>At least ten characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department</FormLabel>
              <Select
                name={field.name}
                items={{ engineering: "Engineering", operations: "Operations" }}
                value={field.value || null}
                onValueChange={(value) => field.onChange(value ?? "")}
              >
                <FormControl>
                  <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                    <SelectValue placeholder="Choose a department" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="engineering">Engineering</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Example choices only.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accepted"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Accept example terms</FormLabel>
              <FormControl>
                <Checkbox
                  name={field.name}
                  ref={field.ref}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormDescription>Required to submit this demo.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority</FormLabel>
              <FormControl>
                <RadioGroup
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-label="Priority"
                >
                  <Label>
                    <RadioGroupItem value="normal" /> Normal
                  </Label>
                  <Label>
                    <RadioGroupItem value="urgent" /> Urgent
                  </Label>
                </RadioGroup>
              </FormControl>
              <FormDescription>Choose one priority.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notifications"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notifications</FormLabel>
              <FormControl>
                <Switch
                  name={field.name}
                  ref={field.ref}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormDescription>Optional example preference.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-3">
          <Button type="submit">Submit example</Button>
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Reset example
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function UiShowcase() {
  const [dark, setDark] = React.useState(false);
  const [menuChecked, setMenuChecked] = React.useState(true);
  const [menuValue, setMenuValue] = React.useState("compact");
  const [transcript, setTranscript] = React.useState("");
  // Portalled overlays inherit the same theme as the showcase.
  React.useEffect(() => {
    const previous = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    return () => {
      document.documentElement.classList.toggle("dark", previous);
    };
  }, [dark]);
  return (
    <TooltipProvider>
      <main className="min-h-screen space-y-section bg-background p-page text-body text-foreground">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-page-title">Primitive kit</h1>
            <p className="text-muted-foreground">
              Development showcase · sample data only
            </p>
          </div>
          <Label>
            Dark mode <Switch checked={dark} onCheckedChange={setDark} />
          </Label>
        </header>
        <Section title="Tokens">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {swatches.map(([name, classes]) => (
              <div key={name} className="space-y-1">
                <div
                  className={`min-h-16 rounded-lg border border-border p-4 ${classes}`}
                >
                  {name.startsWith("Gemba") ||
                  name.startsWith("chart-") ||
                  [
                    "overlay",
                    "sidebar border",
                    "sidebar ring",
                    "border",
                    "input",
                    "ring",
                    "destructive",
                  ].includes(name) ? (
                    <span className="sr-only">{name}</span>
                  ) : (
                    "Aa"
                  )}
                </div>
                <p className="text-sm">{name}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Phase 0 foundations">
          <p className="text-body text-muted-foreground">
            Brand primary: navy in light mode, lime with dark text in dark mode.
            The same tokens drive the whole kit.
          </p>
          <div className="grid gap-section md:grid-cols-2">
            <div className="space-y-control">
              <p className="text-page-title">Page title</p>
              <p className="text-section-title">Section title</p>
              <p className="text-body">Body text · 14px</p>
              <p className="text-caption">Caption · 12px</p>
            </div>
            <div className="space-y-control">
              <p className="text-body">
                Icons: <Check className="inline size-4" aria-hidden="true" />{" "}
                inline · <Plus className="inline size-5" aria-hidden="true" />{" "}
                button · <Check className="inline size-6" aria-hidden="true" />{" "}
                header
              </p>
              <p className="text-caption">
                Page padding: 16 / 24px · section gap: 24px · card: 16px ·
                compact card: 12px
              </p>
              <div className="flex flex-wrap gap-control">
                {[
                  "DRAFT",
                  "PENDING",
                  "APPROVED",
                  "IN_PROGRESS",
                  "REJECTED",
                  "VERIFIED_CLOSED",
                ].map((status) => (
                  <Badge key={status} variant={statusToTone(status)}>
                    {status}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Section>
        <Section title="Button">
          <div className="flex flex-wrap gap-3">
            {(
              [
                "default",
                "secondary",
                "outline",
                "ghost",
                "destructive",
                "destructive-solid",
                "link",
              ] as const
            ).map((variant) => (
              <Button key={variant} variant={variant}>
                {variant}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(["xs", "sm", "default", "lg"] as const).map((size) => (
              <Button key={size} size={size}>
                {size}
              </Button>
            ))}
            {(["icon-xs", "icon-sm", "icon", "icon-lg"] as const).map(
              (size) => (
                <Button key={size} size={size} aria-label={`Add ${size}`}>
                  <Plus />
                </Button>
              ),
            )}
            <Button disabled>Disabled</Button>
            <Button aria-invalid>Invalid</Button>
            <Button disabled>
              <LoaderCircle className="animate-spin" /> Loading
            </Button>
          </div>
        </Section>
        <Section title="Badge">
          <div className="flex flex-wrap gap-3">
            {(
              [
                "default",
                "secondary",
                "outline",
                "ghost",
                "destructive",
                "link",
                "success",
                "warning",
                "info",
                "danger",
                "neutral",
              ] as const
            ).map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ))}
            <Badge aria-invalid>Invalid</Badge>
            <Badge>
              <Check /> With icon
            </Badge>
          </div>
        </Section>
        <Section title="Card">
          <div className="grid gap-4 md:grid-cols-2">
            {(["default", "sm"] as const).map((size) => (
              <Card size={size} key={size}>
                <CardHeader>
                  <CardTitle>{size} card</CardTitle>
                  <CardDescription>Supporting text</CardDescription>
                  <CardAction>
                    <Badge>New</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>Card content</CardContent>
                <CardFooter>
                  <Button variant="outline">Action</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </Section>
        <Section title="Input">
          <div className="grid max-w-lg gap-3">
            <Label htmlFor="input-demo">Example input</Label>
            <Input id="input-demo" placeholder="Enter text" />
            <Input
              disabled
              aria-label="Disabled input"
              placeholder="Disabled"
            />
            <Input
              aria-invalid
              aria-label="Invalid input"
              defaultValue="Invalid value"
            />
            <Input type="file" aria-label="File input" />
            <Input
              type="password"
              aria-label="Password input"
              placeholder="Password"
            />
          </div>
        </Section>
        <Section title="Textarea">
          <div className="grid max-w-lg gap-3">
            <Textarea
              aria-label="Example textarea"
              placeholder="Write a description"
            />
            <Textarea
              disabled
              aria-label="Disabled textarea"
              placeholder="Disabled"
            />
            <Textarea
              aria-invalid
              aria-label="Invalid textarea"
              defaultValue="Invalid description"
            />
          </div>
        </Section>
        <Section title="Label">
          <Label htmlFor="label-demo">Associated label</Label>
          <Input id="label-demo" placeholder="Click the label to focus" />
        </Section>
        <Section title="Select">
          {["default", "disabled", "invalid"].map((state) => (
            <Select
              key={state}
              disabled={state === "disabled"}
              items={{ one: "One", two: "Two", three: "Unavailable" }}
            >
              <SelectTrigger
                aria-label={`${state} select`}
                aria-invalid={state === "invalid"}
              >
                <SelectValue placeholder={`${state} select`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one">One</SelectItem>
                <SelectItem value="two">Two</SelectItem>
                <SelectItem value="three" disabled>
                  Unavailable
                </SelectItem>
              </SelectContent>
            </Select>
          ))}
          <Select items={{ small: "Small choice" }}>
            <SelectTrigger size="sm" aria-label="Small select">
              <SelectValue placeholder="Small select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small choice</SelectItem>
            </SelectContent>
          </Select>
        </Section>
        <Section title="Checkbox">
          <div className="flex flex-wrap gap-6">
            <Label>
              <Checkbox /> Unchecked
            </Label>
            <Label>
              <Checkbox defaultChecked /> Checked
            </Label>
            <Label>
              <Checkbox indeterminate /> Indeterminate
            </Label>
            <Label>
              <Checkbox disabled /> Disabled
            </Label>
            <Label>
              <Checkbox aria-invalid /> Invalid
            </Label>
          </div>
        </Section>
        <Section title="Radio group">
          <RadioGroup defaultValue="one" aria-label="Example radio choices">
            <Label>
              <RadioGroupItem value="one" /> First
            </Label>
            <Label>
              <RadioGroupItem value="two" /> Second
            </Label>
            <Label>
              <RadioGroupItem value="three" disabled /> Disabled
            </Label>
            <Label>
              <RadioGroupItem value="invalid" aria-invalid /> Invalid
            </Label>
          </RadioGroup>
        </Section>
        <Section title="Switch">
          <div className="flex flex-wrap gap-6">
            <Label>
              <Switch /> Off
            </Label>
            <Label>
              <Switch defaultChecked /> On
            </Label>
            <Label>
              <Switch disabled /> Disabled
            </Label>
            <Label>
              <Switch aria-invalid /> Invalid
            </Label>
          </div>
          <Label>
            <Switch size="sm" /> Small switch
          </Label>
        </Section>
        <Section title="Dialog">
          <Dialog>
            <DialogTrigger render={<Button />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Example dialog</DialogTitle>
                <DialogDescription>
                  Focus stays inside until you close this dialog.
                </DialogDescription>
              </DialogHeader>
              <Label htmlFor="dialog-input">Example value</Label>
              <Input id="dialog-input" />
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Close dialog
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>
        <Section title="Alert dialog">
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive-solid" />}>
              Open confirmation
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm example action?</AlertDialogTitle>
                <AlertDialogDescription>
                  This only shows a toast; no records are changed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => toast.success("Example action confirmed")}
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" />}>
              Open small confirmation
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Check />
                </AlertDialogMedia>
                <AlertDialogTitle>Small confirmation</AlertDialogTitle>
                <AlertDialogDescription>
                  Compact size with media.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Continue</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>
        <Section title="Sheet">
          <div className="flex flex-wrap gap-3">
            {(["top", "right", "bottom", "left"] as const).map((side) => (
              <Sheet key={side}>
                <SheetTrigger render={<Button variant="outline" />}>
                  Open {side} sheet
                </SheetTrigger>
                <SheetContent side={side}>
                  <SheetHeader>
                    <SheetTitle>{side} sheet</SheetTitle>
                    <SheetDescription>A sample drawer.</SheetDescription>
                  </SheetHeader>
                  <div className="p-4">Sheet content</div>
                  <SheetFooter>
                    <SheetClose render={<Button />}>Close sheet</SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            ))}
          </div>
        </Section>
        <Section title="Tabs">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Disabled
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview">Overview panel</TabsContent>
            <TabsContent value="details">Details panel</TabsContent>
          </Tabs>
          {(["horizontal", "vertical"] as const).map((orientation) => (
            <Tabs
              key={orientation}
              orientation={orientation}
              defaultValue="first"
            >
              <TabsList variant="line">
                <TabsTrigger value="first">{orientation} first</TabsTrigger>
                <TabsTrigger value="second">{orientation} second</TabsTrigger>
              </TabsList>
              <TabsContent value="first">
                Line variant, {orientation} orientation.
              </TabsContent>
              <TabsContent value="second">Second panel.</TabsContent>
            </Tabs>
          ))}
        </Section>
        <Section title="Table">
          <Table>
            <TableCaption>Sample records</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Example record</TableCell>
                <TableCell>
                  <Badge variant="success">Approved</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>1 record</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Section>
        <Section title="Dropdown menu">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Open menu
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Example actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => toast("Edit selected")}>
                  Edit<DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>Unavailable</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={menuChecked}
                onCheckedChange={setMenuChecked}
              >
                Show details
              </DropdownMenuCheckboxItem>
              <DropdownMenuRadioGroup
                value={menuValue}
                onValueChange={setMenuValue}
              >
                <DropdownMenuRadioItem value="compact">
                  Compact
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="comfortable">
                  Comfortable
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>More</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => toast("Export selected")}>
                    Export
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => toast("Example delete selected")}
              >
                Delete example
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>
        <Section title="Skeleton">
          <div
            role="status"
            aria-label="Loading example"
            className="flex items-center gap-4"
          >
            <Skeleton className="size-12 rounded-full" />
            <div className="w-48 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </Section>
        <Section title="Separator">
          <p>Above</p>
          <Separator />
          <p>Below</p>
          <div className="flex h-8 items-center gap-4">
            <span>Left</span>
            <Separator orientation="vertical" />
            <span>Right</span>
          </div>
        </Section>
        <Section title="Scroll area">
          <ScrollArea className="h-40 w-72 rounded-lg border">
            <div className="w-96 space-y-3 p-4">
              {Array.from({ length: 12 }, (_, i) => (
                <p key={i}>Scrollable example row {i + 1}</p>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Section>
        <Section title="Sonner">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => toast("Example toast")}>
              Default toast
            </Button>
            <Button onClick={() => toast.success("Example success")}>
              Success toast
            </Button>
            <Button onClick={() => toast.error("Example error")}>
              Error toast
            </Button>
            <Button onClick={() => toast.info("Example information")}>
              Info toast
            </Button>
            <Button onClick={() => toast.warning("Example warning")}>
              Warning toast
            </Button>
            <Button
              onClick={() =>
                toast.promise(
                  new Promise((resolve) => setTimeout(resolve, 1000)),
                  {
                    loading: "Loading example…",
                    success: "Example loaded",
                    error: "Example failed",
                  },
                )
              }
            >
              Promise toast
            </Button>
            <Button
              onClick={() =>
                toast("Example action", {
                  action: { label: "Undo", onClick: () => toast("Undone") },
                })
              }
            >
              Action toast
            </Button>
          </div>
        </Section>
        <Section title="Popover">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              Open popover
            </PopoverTrigger>
            <PopoverContent>Example popover content</PopoverContent>
          </Popover>
        </Section>
        <Section title="Tooltip">
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" />}>
              Hover or focus for tooltip
            </TooltipTrigger>
            <TooltipContent>Example tooltip</TooltipContent>
          </Tooltip>
        </Section>
        <Section title="Avatar">
          <AvatarGroup>
            {(["sm", "default", "lg"] as const).map((size) => (
              <Avatar key={size} size={size}>
                <AvatarImage
                  src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Ctext x='4' y='28'%3EUI%3C/text%3E%3C/svg%3E"
                  alt="Example avatar"
                />
                <AvatarFallback>UI</AvatarFallback>
                <AvatarBadge>
                  <Check />
                </AvatarBadge>
              </Avatar>
            ))}
            <Avatar>
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+3</AvatarGroupCount>
          </AvatarGroup>
        </Section>
        <Section title="Progress">
          <Progress value={60}>
            <ProgressLabel>Example progress</ProgressLabel>
            <ProgressValue />
          </Progress>
          <Progress value={null}>
            <ProgressLabel>Indeterminate progress</ProgressLabel>
          </Progress>
          <Progress value={100}>
            <ProgressLabel>Complete</ProgressLabel>
          </Progress>
        </Section>
        <Section title="Form">
          <ExampleForm />
        </Section>
        <Section title="Legacy components in ui">
          <p className="text-sm text-muted-foreground">
            Existing module components remain here pending a Phase 0 folder
            decision. Their styling is unchanged.
          </p>
          <CoverCardGrid>
            <CoverCard
              href="/dev/ui"
              title="Example cover card"
              meta="Sample metadata"
              coverIcon={<Plus />}
              tone="bg-info-subtle text-info"
              statusLabel="Example"
            />
            <CoverCard
              href="/dev/ui"
              title="Example action card"
              meta="With action"
              coverIcon={<Plus />}
              tone="bg-success-subtle text-success"
              statusLabel="Example"
              cta="View example"
            />
          </CoverCardGrid>
          <FinancialImpact
            entries={[
              {
                id: "example",
                title: "Example improvement",
                department: "Demo",
                currency: "KES",
                benefit: 1000,
                cost: 250,
              },
            ]}
            benefitLabel="Benefit"
            benefitDetail="Example benefit"
            costLabel="Cost"
            costDetail="Example cost"
            linkBase="/dev/ui#"
            emptyText="No examples"
          />
          <div className="flex flex-wrap gap-3">
            {(["suggestion", "kaizen", "sga", "fiveS", "alert"] as const).map(
              (tone) => (
                <LinkedRecordChip
                  key={tone}
                  href="/dev/ui"
                  label={tone}
                  title="Example record"
                  tone={tone}
                />
              ),
            )}
          </div>
          <Label htmlFor="speech-demo">
            Speech example (browser support required)
          </Label>
          <div className="flex gap-3">
            <Input
              id="speech-demo"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
            />
            <SpeechToTextButton onResult={setTranscript} />
            <SpeechToTextButton onResult={setTranscript} disabled />
          </div>
        </Section>
        <PatternShowcase />
        <TemplateShowcase />
      </main>
    </TooltipProvider>
  );
}
