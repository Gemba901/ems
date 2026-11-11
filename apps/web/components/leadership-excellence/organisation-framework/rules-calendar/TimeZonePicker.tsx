"use client";

import { useId, useMemo, useRef, useState, type AriaAttributes } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown } from "lucide-react";
import {
  timeZoneDisplay,
  timeZoneOptions,
  validTimeZone,
} from "./time-zone-options";
import styles from "./rules-calendar.module.css";

/** Search text never changes the saved selection. Only choosing a listed zone does. */
export function TimeZonePicker({
  value,
  companyTimeZone,
  disabled,
  onChange,
  ...aria
}: {
  value: string;
  companyTimeZone: string;
  disabled?: boolean;
  onChange: (value: string) => void;
} & Pick<AriaAttributes, "aria-invalid" | "aria-describedby">) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const valueId = useId();
  const options = useMemo(
    () => timeZoneOptions(value, companyTimeZone),
    [value, companyTimeZone],
  );
  const labels = useMemo(
    () =>
      new Map(
        options.map((zone) => [zone, timeZoneDisplay(zone, referenceDate)]),
      ),
    [options, referenceDate],
  );
  const label = (zone: string) =>
    labels.get(zone) ?? timeZoneDisplay(zone, referenceDate);
  return (
    <Combobox.Root
      items={options}
      value={validTimeZone(value) ? value : null}
      disabled={disabled}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        setQuery("");
        if (open) setReferenceDate(new Date());
      }}
      onValueChange={(zone) => {
        if (zone && validTimeZone(zone)) onChange(zone);
      }}
      itemToStringLabel={label}
      filter={(zone, text) =>
        `${zone} ${label(zone)}`
          .toLowerCase()
          .includes(text.trim().toLowerCase())
      }
      autoHighlight
    >
      <Combobox.Trigger
        {...aria}
        aria-label="Time zone"
        aria-describedby={[valueId, aria["aria-describedby"]]
          .filter(Boolean)
          .join(" ")}
        title={value}
        className={styles.timeZoneTrigger}
      >
        <span id={valueId}>{value ? label(value) : "Choose a time zone"}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={6}
          align="start"
          className={styles.timeZonePositioner}
        >
          <Combobox.Popup
            className={styles.timeZonePopup}
            initialFocus={search}
          >
            <Combobox.Input
              ref={search}
              aria-label="Search time zones"
              placeholder="Search city or time zone…"
              className={styles.timeZoneSearch}
            />
            <Combobox.Empty className={styles.timeZoneEmpty}>
              No time zones match. Try another city or zone name.
            </Combobox.Empty>
            <Combobox.List
              aria-label="Time zones"
              className={styles.timeZoneList}
            >
              {(zone: string) => (
                <Combobox.Item
                  key={zone}
                  value={zone}
                  className={styles.timeZoneOption}
                >
                  <span>
                    <span>{label(zone)}</span>
                    <small>{zone}</small>
                  </span>
                  <Combobox.ItemIndicator>
                    <Check aria-hidden="true" size={16} />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            <p className={styles.timeZoneHint}>
              UTC offsets shown for today; some change during the year.
            </p>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
