"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import { useState } from "react";
import { AlertCircle, ArrowRight, Check, Columns3, FileSpreadsheet, X } from "lucide-react";
import {
    DETAIL_FIELDS, IDENTIFIER_FIELDS, NAME_SPLIT_OPTIONS,
    EmployeeImportMapping, FieldDef, ImportField, SheetData,
    cellText, columnLetter, detectHeaderRow, mappingProblems, pickDefaultSheet, splitFullName, suggestColumns,
} from "@/lib/employee-import-mapping";

type Props = {
    fileName: string;
    sheets: SheetData[];
    // Re-opening the dialog keeps what the user mapped last time.
    initialMapping?: EmployeeImportMapping | null;
    onCancel: () => void;
    onConfirm: (mapping: EmployeeImportMapping) => void;
};

const PREVIEW_ROWS = 5;

function buildMapping(sheets: SheetData[], sheetName: string, headerRow?: number): EmployeeImportMapping {
    const rows = sheets.find((s) => s.name === sheetName)?.rows ?? [];
    const headerIndex = headerRow !== undefined ? headerRow - 1 : detectHeaderRow(rows);
    const columns = suggestColumns(rows[headerIndex] ?? []);
    const hasSeparate = columns.firstName !== undefined && columns.lastName !== undefined;
    return {
        sheetName,
        headerRow: headerIndex + 1,
        nameMode: !hasSeparate && columns.fullName !== undefined ? "full" : "separate",
        nameSplit: "first-rest",
        columns,
    };
}

export default function ColumnMappingDialog({ fileName, sheets, initialMapping, onCancel, onConfirm }: Props) {
    const [mapping, setMapping] = useState<EmployeeImportMapping>(
        () => initialMapping ?? buildMapping(sheets, pickDefaultSheet(sheets)),
    );

    const rows = sheets.find((s) => s.name === mapping.sheetName)?.rows ?? [];
    const headerIndex = mapping.headerRow - 1;
    const headers = rows[headerIndex] ?? [];
    const dataRows = rows.slice(headerIndex + 1).filter((row) => (row ?? []).some((cell) => cellText(cell)));
    const columnCount = Math.max(headers.length, ...rows.slice(headerIndex, headerIndex + 20).map((r) => r?.length ?? 0));
    const columnOptions = Array.from({ length: columnCount }, (_, i) => ({
        index: i,
        label: `${columnLetter(i)} · ${cellText(headers[i]) || "(no header)"}`,
    }));

    const usage = new Map<number, ImportField[]>();
    for (const [field, index] of Object.entries(mapping.columns)) {
        if (index === undefined) continue;
        usage.set(index, [...(usage.get(index) ?? []), field as ImportField]);
    }

    const setColumn = (field: ImportField, value: string) =>
        setMapping((m) => {
            const columns = { ...m.columns };
            if (value === "") delete columns[field];
            else columns[field] = Number(value);
            return { ...m, columns };
        });

    const problems = mappingProblems(mapping);
    const sampleFullName = mapping.columns.fullName !== undefined
        ? dataRows.map((r) => cellText(r[mapping.columns.fullName!])).find((v) => v.split(" ").length >= 3)
            ?? dataRows.map((r) => cellText(r[mapping.columns.fullName!])).find(Boolean)
            ?? "John Kamau Mwangi"
        : "John Kamau Mwangi";

    const previewName = (row: unknown[]) => {
        if (mapping.nameMode === "full") {
            return splitFullName(cellText(row[mapping.columns.fullName ?? -1]), mapping.nameSplit);
        }
        return {
            firstName: cellText(row[mapping.columns.firstName ?? -1]),
            middleName: cellText(row[mapping.columns.middleName ?? -1]),
            lastName: cellText(row[mapping.columns.lastName ?? -1]),
        };
    };
    const valueOf = (row: unknown[], field: ImportField) =>
        mapping.columns[field] === undefined ? "" : cellText(row[mapping.columns[field]!]);

    const renderSelect = (field: FieldDef, required = false) => {
        const index = mapping.columns[field.key];
        const sharedWith = index !== undefined ? (usage.get(index) ?? []).filter((f) => f !== field.key) : [];
        return (
            <label key={field.key} className="block">
                <span className="text-xs font-semibold text-muted-foreground">
                    {field.label}{required && <span className="text-danger"> *</span>}
                </span>
                <NativeSelect
                    value={index ?? ""}
                    onChange={(e) => setColumn(field.key, e.target.value)}
                    className={`mt-1 w-full text-sm border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring ${index === undefined ? "border-border text-muted-foreground" : "border-primary/20 text-foreground"}`}
                >
                    <option value="">— Not in this sheet —</option>
                    {columnOptions.map((o) => (
                        <option key={o.index} value={o.index}>{o.label}</option>
                    ))}
                </NativeSelect>
                {index !== undefined && (
                    <span className="mt-1 block text-[11px] text-muted-foreground truncate">
                        e.g. {dataRows.map((r) => cellText(r[index])).find(Boolean) || "(empty)"}
                    </span>
                )}
                {sharedWith.length > 0 && (
                    <span className="mt-0.5 block text-[11px] text-warning">Also used for another field</span>
                )}
            </label>
        );
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
            <DialogContent showCloseButton={false} className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl" data-tour="import-mapping">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <Columns3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle>Match your columns</DialogTitle>
                            <DialogDescription>
                                Tell us which column in <span className="font-medium text-foreground">{fileName}</span> holds each piece of employee data.
                            </DialogDescription>
                        </div>
                    </div>
                    <Button variant="ghost" onClick={onCancel} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground" aria-label="Close">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                    {/* Sheet + header row */}
                    <section className="grid gap-4 sm:grid-cols-3">
                        <label className="block sm:col-span-2">
                            <span className="text-xs font-semibold text-muted-foreground">Sheet</span>
                            <NativeSelect
                                value={mapping.sheetName}
                                onChange={(e) => setMapping(buildMapping(sheets, e.target.value))}
                                className="mt-1 w-full text-sm border border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                            >
                                {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                            </NativeSelect>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-muted-foreground">Header row</span>
                            <Input
                                type="number"
                                min={1}
                                max={Math.max(1, rows.length)}
                                value={mapping.headerRow}
                                onChange={(e) => {
                                    const value = Number(e.target.value);
                                    if (Number.isInteger(value) && value >= 1 && value <= rows.length) {
                                        setMapping((m) => ({ ...buildMapping(sheets, m.sheetName, value), nameSplit: m.nameSplit }));
                                    }
                                }}
                                className="mt-1 w-full text-sm border border-border rounded-lg px-2.5 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring"
                            />
                        </label>
                        <p className="sm:col-span-3 -mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            {dataRows.length} employee row{dataRows.length === 1 ? "" : "s"} found below the header row.
                        </p>
                    </section>

                    {/* Names */}
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-sm font-bold text-foreground">Employee names</h3>
                            <p className="text-xs text-muted-foreground">The system stores a first name and a last name for every employee.</p>
                        </div>
                        <div className="flex flex-wrap rounded-lg border border-border bg-muted p-0.5 text-xs font-semibold">
                            {([["full", "One full-name column"], ["separate", "Separate first & last name columns"]] as const).map(([value, label]) => (
                                <Button variant="ghost"
                                    key={value}
                                    aria-pressed={mapping.nameMode === value}
                                    type="button"
                                    onClick={() => setMapping((m) => ({ ...m, nameMode: value }))}
                                    className={`rounded-md px-3 py-1.5 transition-colors ${mapping.nameMode === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>

                        {mapping.nameMode === "full" ? (
                            <div className="space-y-3">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {renderSelect({ key: "fullName", label: "Full name", aliases: [] }, true)}
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-muted-foreground">How should we split the full name?</span>
                                    <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                                        {NAME_SPLIT_OPTIONS.map((option) => {
                                            const example = splitFullName(sampleFullName, option.value);
                                            const selected = mapping.nameSplit === option.value;
                                            return (
                                                <Button variant="ghost"
                                                    key={option.value}
                                                    aria-pressed={selected}
                                                    type="button"
                                                    onClick={() => setMapping((m) => ({ ...m, nameSplit: option.value }))}
                                                    className={`h-auto flex-col items-stretch whitespace-normal rounded-xl border p-3 text-left transition-colors ${selected ? "border-ring bg-primary/60 ring-2 ring-ring/15" : "border-border hover:border-border"}`}
                                                >
                                                    <span className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                                                        {option.label}
                                                        {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                                                    </span>
                                                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{option.hint}</span>
                                                    <span className="mt-2 block text-[11px] text-muted-foreground">
                                                        <span className="text-muted-foreground">{sampleFullName}</span>
                                                        <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                                                        <span className="font-semibold">{example.firstName || "?"}</span>
                                                        {" / "}
                                                        <span className="font-semibold">{example.lastName || "?"}</span>
                                                    </span>
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-3">
                                {renderSelect({ key: "firstName", label: "First name", aliases: [] }, true)}
                                {renderSelect({ key: "middleName", label: "Middle name (optional)", aliases: [] })}
                                {renderSelect({ key: "lastName", label: "Last name", aliases: [] }, true)}
                            </div>
                        )}
                    </section>

                    {/* Identifiers */}
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-sm font-bold text-foreground">How we recognise each employee</h3>
                            <p className="text-xs text-muted-foreground">Map at least one. These are used for sign-in and to update the right person on re-import.</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {IDENTIFIER_FIELDS.map((f) => renderSelect(f))}
                        </div>
                    </section>

                    {/* Other details */}
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-sm font-bold text-foreground">Other details <span className="font-normal text-muted-foreground">(optional)</span></h3>
                            <p className="text-xs text-muted-foreground">Leave anything your sheet doesn&apos;t have as &ldquo;Not in this sheet&rdquo;.</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {DETAIL_FIELDS.map((f) => renderSelect(f))}
                        </div>
                    </section>

                    {/* Preview */}
                    <section className="space-y-2">
                        <h3 className="text-sm font-bold text-foreground">Preview</h3>
                        <div className="overflow-x-auto rounded-xl border border-border">
                            <Table className="w-full text-xs">
                                <TableHeader className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                                    <TableRow>
                                        <TableHead className="px-3 py-2 text-left font-semibold">Row</TableHead>
                                        <TableHead className="px-3 py-2 text-left font-semibold">First name</TableHead>
                                        <TableHead className="px-3 py-2 text-left font-semibold">Last name</TableHead>
                                        <TableHead className="px-3 py-2 text-left font-semibold">Email</TableHead>
                                        <TableHead className="px-3 py-2 text-left font-semibold">Phone</TableHead>
                                        <TableHead className="px-3 py-2 text-left font-semibold">Department</TableHead>
                                        <TableHead className="px-3 py-2 text-left font-semibold">Job title</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="divide-y divide-border">
                                    {dataRows.slice(0, PREVIEW_ROWS).map((row, i) => {
                                        const name = previewName(row);
                                        const missing = <span className="text-danger">missing</span>;
                                        return (
                                            <TableRow key={i}>
                                                <TableCell className="px-3 py-2 text-muted-foreground">{rows.indexOf(row) + 1}</TableCell>
                                                <TableCell className="px-3 py-2 font-medium text-foreground">{name.firstName || missing}</TableCell>
                                                <TableCell className="px-3 py-2 font-medium text-foreground">{name.lastName || missing}</TableCell>
                                                <TableCell className="px-3 py-2 text-muted-foreground">{valueOf(row, "email") || valueOf(row, "personalEmail")}</TableCell>
                                                <TableCell className="px-3 py-2 text-muted-foreground">{valueOf(row, "phone")}</TableCell>
                                                <TableCell className="px-3 py-2 text-muted-foreground">{valueOf(row, "department")}</TableCell>
                                                <TableCell className="px-3 py-2 text-muted-foreground">{valueOf(row, "jobTitle")}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {dataRows.length === 0 && (
                                        <TableRow><TableCell colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No rows below the header row.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/60 px-6 py-3.5">
                    <div className="min-h-[1rem] text-xs">
                        {problems.length > 0 ? (
                            <span className="flex items-center gap-1.5 text-warning">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {problems[0]}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-success">
                                <Check className="h-3.5 w-3.5" /> Ready to check {dataRows.length} row{dataRows.length === 1 ? "" : "s"}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onCancel} className="rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
                            Cancel
                        </Button>
                        <Button
                            onClick={() => onConfirm(mapping)}
                            disabled={problems.length > 0}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Check import <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
