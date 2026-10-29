"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
export interface FilterValues {
  search: string;
  filters: Record<string, string>;
  from: string;
  to: string;
}
export const EMPTY_FILTERS: FilterValues = {
  search: "",
  filters: {},
  from: "",
  to: "",
};
export interface FilterDefinition {
  id: string;
  label: string;
  options: { value: string; label: string }[];
}
export interface FilterBarProps {
  value: FilterValues;
  onChange: (value: FilterValues) => void;
  filters?: FilterDefinition[];
  dateRange?: boolean;
  searchLabel?: string;
  searchable?: boolean;
  disabled?: boolean;
}
export function FilterBar({
  value,
  onChange,
  filters = [],
  dateRange = false,
  searchLabel = "Search records",
  searchable = true,
  disabled = false,
}: FilterBarProps) {
  const id = useId();
  const invalid = !!(value.from && value.to && value.from > value.to);
  return (
    <div
      role="search"
      aria-label="Filter records"
      className="flex flex-wrap items-end gap-3"
    >
      {searchable && (
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${id}-search`}>{searchLabel}</Label>
          <Input
            id={`${id}-search`}
            type="search"
            value={value.search}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
          />
        </div>
      )}
      {filters.map((filter) => (
        <div key={filter.id} className="grid gap-2">
          <Label id={`${id}-${filter.id}`}>{filter.label}</Label>
          <Select
            items={Object.fromEntries([
              ["", "All"],
              ...filter.options.map((option) => [option.value, option.label]),
            ])}
            value={value.filters[filter.id] || ""}
            disabled={disabled}
            onValueChange={(v) =>
              onChange({
                ...value,
                filters: { ...value.filters, [filter.id]: v ?? "" },
              })
            }
          >
            <SelectTrigger aria-labelledby={`${id}-${filter.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {dateRange && (
        <>
          {(["from", "to"] as const).map((key) => (
            <div key={key} className="grid gap-2">
              <Label htmlFor={`${id}-${key}`}>
                {key === "from" ? "From date" : "To date"}
              </Label>
              <Input
                type="date"
                id={`${id}-${key}`}
                value={value[key]}
                disabled={disabled}
                aria-invalid={invalid}
                aria-describedby={invalid ? `${id}-date-error` : undefined}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              />
            </div>
          ))}
        </>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange({ ...EMPTY_FILTERS, filters: {} })}
      >
        Reset filters
      </Button>
      {invalid && (
        <p
          id={`${id}-date-error`}
          role="alert"
          className="w-full text-caption text-danger"
        >
          End date must be on or after start date.
        </p>
      )}
    </div>
  );
}
