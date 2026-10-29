"use client";
import { useState } from "react";
import { ListPageTemplate } from "@/components/templates/ListPageTemplate";
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { FormPageTemplate } from "@/components/templates/FormPageTemplate";
import { DashboardPageTemplate } from "@/components/templates/DashboardPageTemplate";
import { SectionCard } from "@/components/patterns/SectionCard";
import { FormField } from "@/components/patterns/FormField";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
const rows = [
  { id: "T-201", subject: "Scanner repair", status: "OPEN" },
  { id: "T-202", subject: "Restore access", status: "RESOLVED" },
];
export function TemplateShowcase() {
  const [view, setView] = useState<"list" | "detail" | "form" | "dashboard">(
    "list",
  );
  const [selected, setSelected] = useState(rows[0]);
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section
      aria-label="Phase 3 page templates"
      className="space-y-section border-t border-border pt-6"
    >
      <h2 className="text-section-title">Phase 3 · Page templates</h2>
      <p className="text-body text-muted-foreground">
        Tickets fixtures. Change the layout below; all actions stay local.
      </p>
      <div
        role="group"
        aria-label="Choose template"
        className="flex flex-wrap gap-control"
      >
        {(["list", "detail", "form", "dashboard"] as const).map((item) => (
          <Button
            type="button"
            key={item}
            aria-pressed={view === item}
            variant={view === item ? "default" : "outline"}
            onClick={() => setView(item)}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)} template
          </Button>
        ))}
      </div>
      <div className="min-w-0 rounded-xl border border-border p-card">
        {view === "list" && (
          <ListPageTemplate
            header={{
              title: "Tickets",
              description: "List template",
              actions: (
                <Button onClick={() => setView("form")}>
                  New fixture ticket
                </Button>
              ),
            }}
            table={{
              caption: "Template demo tickets",
              rows,
              getRowId: (r) => r.id,
              searchText: (r) => r.subject,
              columns: [
                {
                  id: "subject",
                  header: "Subject",
                  cell: (r) => r.subject,
                  sortValue: (r) => r.subject,
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (r) => <StatusBadge status={r.status} />,
                },
              ],
              rowActions: (r) => (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(r);
                    setView("detail");
                  }}
                >
                  Open {r.id}
                </Button>
              ),
            }}
          />
        )}
        {view === "detail" && (
          <DetailPageTemplate
            header={{ title: selected.id, description: "Detail template" }}
            status={selected.status}
            details={[
              { label: "Subject", value: selected.subject },
              { label: "Assignee", value: null },
            ]}
            activity={[
              {
                id: "created",
                title: "Ticket created",
                dateTime: "2026-10-29",
                timeLabel: "29 October 2026",
              },
            ]}
          >
            <SectionCard title="Request">
              <p>{selected.subject}</p>
            </SectionCard>
          </DetailPageTemplate>
        )}
        {view === "form" && (
          <FormPageTemplate
            header={{
              title: "Create fixture ticket",
              description: "Form template · local demo only",
            }}
            noValidate
            sections={[
              {
                id: "request",
                title: "Request",
                description: "Enter the subject, then save.",
                content: (
                  <FormField label="Subject" required error={error}>
                    <Input
                      value={subject}
                      disabled={pending}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </FormField>
                ),
              },
            ]}
            actions={{
              pending,
              submitLabel: "Save fixture ticket",
              onCancel: () => {
                setSubject("");
                setError("");
                setView("list");
              },
            }}
            onSubmit={async (event) => {
              event.preventDefault();
              if (!subject.trim()) {
                setError("Enter a subject.");
                return;
              }
              setError("");
              setPending(true);
              await new Promise((resolve) => setTimeout(resolve, 350));
              setPending(false);
              setMessage("Fixture ticket saved locally.");
            }}
          />
        )}
        {view === "dashboard" && (
          <DashboardPageTemplate
            header={{
              title: "Ticket dashboard",
              description: "Dashboard template",
            }}
            stats={[
              { id: "open", label: "Open", value: 12 },
              { id: "resolved", label: "Resolved", value: 28 },
            ]}
            charts={[
              {
                id: "volume",
                title: "Ticket volume",
                categoryKey: "day",
                data: [
                  { day: "Mon", count: 3 },
                  { day: "Tue", count: 5 },
                ],
                series: [{ key: "count", label: "Tickets", token: "chart-1" }],
              },
            ]}
          />
        )}
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
