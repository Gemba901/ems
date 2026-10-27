"use client";

import { useMemo, useState } from "react";
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
    const dataRows = useMemo(
        () => rows.slice(headerIndex + 1).filter((r) => (r ?? []).some((c) => cellText(c))),
        [rows, headerIndex],
    );
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
                <span className="text-xs font-semibold text-slate-600">
                    {field.label}{required && <span className="text-red-500"> *</span>}
                </span>
                <select
                    value={index ?? ""}
                    onChange={(e) => setColumn(field.key, e.target.value)}
                    className={`mt-1 w-full text-sm border rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${index === undefined ? "border-slate-200 text-slate-400" : "border-indigo-200 text-slate-800"}`}
                >
                    <option value="">— Not in this sheet —</option>
                    {columnOptions.map((o) => (
                        <option key={o.index} value={o.index}>{o.label}</option>
                    ))}
                </select>
                {index !== undefined && (
                    <span className="mt-1 block text-[11px] text-slate-400 truncate">
                        e.g. {dataRows.map((r) => cellText(r[index])).find(Boolean) || "(empty)"}
                    </span>
                )}
                {sharedWith.length > 0 && (
                    <span className="mt-0.5 block text-[11px] text-amber-600">Also used for another field</span>
                )}
            </label>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
            <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" data-tour="import-mapping">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                            <Columns3 className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Match your columns</h2>
                            <p className="text-sm text-slate-500">
                                Tell us which column in <span className="font-medium text-slate-700">{fileName}</span> holds each piece of employee data.
                            </p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
                    {/* Sheet + header row */}
                    <section className="grid gap-4 sm:grid-cols-3">
                        <label className="block sm:col-span-2">
                            <span className="text-xs font-semibold text-slate-600">Sheet</span>
                            <select
                                value={mapping.sheetName}
                                onChange={(e) => setMapping(buildMapping(sheets, e.target.value))}
                                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            >
                                {sheets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-600">Header row</span>
                            <input
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
                                className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                            />
                        </label>
                        <p className="sm:col-span-3 -mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            {dataRows.length} employee row{dataRows.length === 1 ? "" : "s"} found below the header row.
                        </p>
                    </section>

                    {/* Names */}
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">Employee names</h3>
                            <p className="text-xs text-slate-500">The system stores a first name and a last name for every employee.</p>
                        </div>
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
                            {([["full", "One full-name column"], ["separate", "Separate first & last name columns"]] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMapping((m) => ({ ...m, nameMode: value }))}
                                    className={`rounded-md px-3 py-1.5 transition-colors ${mapping.nameMode === value ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {mapping.nameMode === "full" ? (
                            <div className="space-y-3">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {renderSelect({ key: "fullName", label: "Full name", aliases: [] }, true)}
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-slate-600">How should we split the full name?</span>
                                    <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                                        {NAME_SPLIT_OPTIONS.map((option) => {
                                            const example = splitFullName(sampleFullName, option.value);
                                            const selected = mapping.nameSplit === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => setMapping((m) => ({ ...m, nameSplit: option.value }))}
                                                    className={`rounded-xl border p-3 text-left transition-colors ${selected ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-500/15" : "border-slate-200 hover:border-slate-300"}`}
                                                >
                                                    <span className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-800">
                                                        {option.label}
                                                        {selected && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                                                    </span>
                                                    <span className="mt-0.5 block text-[11px] text-slate-500">{option.hint}</span>
                                                    <span className="mt-2 block text-[11px] text-slate-600">
                                                        <span className="text-slate-400">{sampleFullName}</span>
                                                        <ArrowRight className="mx-1 inline h-3 w-3 text-slate-300" />
                                                        <span className="font-semibold">{example.firstName || "?"}</span>
                                                        {" / "}
                                                        <span className="font-semibold">{example.lastName || "?"}</span>
                                                    </span>
                                                </button>
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
                            <h3 className="text-sm font-bold text-slate-800">How we recognise each employee</h3>
                            <p className="text-xs text-slate-500">Map at least one. These are used for sign-in and to update the right person on re-import.</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {IDENTIFIER_FIELDS.map((f) => renderSelect(f))}
                        </div>
                    </section>

                    {/* Other details */}
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">Other details <span className="font-normal text-slate-400">(optional)</span></h3>
                            <p className="text-xs text-slate-500">Leave anything your sheet doesn&apos;t have as &ldquo;Not in this sheet&rdquo;.</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {DETAIL_FIELDS.map((f) => renderSelect(f))}
                        </div>
                    </section>

                    {/* Preview */}
                    <section className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-800">Preview</h3>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Row</th>
                                        <th className="px-3 py-2 text-left font-semibold">First name</th>
                                        <th className="px-3 py-2 text-left font-semibold">Last name</th>
                                        <th className="px-3 py-2 text-left font-semibold">Email</th>
                                        <th className="px-3 py-2 text-left font-semibold">Phone</th>
                                        <th className="px-3 py-2 text-left font-semibold">Department</th>
                                        <th className="px-3 py-2 text-left font-semibold">Job title</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {dataRows.slice(0, PREVIEW_ROWS).map((row, i) => {
                                        const name = previewName(row);
                                        const missing = <span className="text-red-500">missing</span>;
                                        return (
                                            <tr key={i}>
                                                <td className="px-3 py-2 text-slate-400">{rows.indexOf(row) + 1}</td>
                                                <td className="px-3 py-2 font-medium text-slate-800">{name.firstName || missing}</td>
                                                <td className="px-3 py-2 font-medium text-slate-800">{name.lastName || missing}</td>
                                                <td className="px-3 py-2 text-slate-600">{valueOf(row, "email") || valueOf(row, "personalEmail")}</td>
                                                <td className="px-3 py-2 text-slate-600">{valueOf(row, "phone")}</td>
                                                <td className="px-3 py-2 text-slate-600">{valueOf(row, "department")}</td>
                                                <td className="px-3 py-2 text-slate-600">{valueOf(row, "jobTitle")}</td>
                                            </tr>
                                        );
                                    })}
                                    {dataRows.length === 0 && (
                                        <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No rows below the header row.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">
                    <div className="min-h-[1rem] text-xs">
                        {problems.length > 0 ? (
                            <span className="flex items-center gap-1.5 text-amber-700">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {problems[0]}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-emerald-700">
                                <Check className="h-3.5 w-3.5" /> Ready to check {dataRows.length} row{dataRows.length === 1 ? "" : "s"}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(mapping)}
                            disabled={problems.length > 0}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Check import <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
