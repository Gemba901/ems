import test from "node:test";
import assert from "node:assert/strict";
import {
  timeZoneLabel,
  timeZoneDisplay,
  timeZoneOptions,
  validTimeZone,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/time-zone-options";

test("time-zone choices include UTC, the company zone and valid saved aliases", () => {
  const zones = timeZoneOptions("Asia/Kolkata", "Africa/Nairobi");
  assert.equal(zones[0], "UTC");
  for (const zone of [
    "Asia/Kolkata",
    "Africa/Nairobi",
    "Europe/London",
    "America/New_York",
  ])
    assert.ok(zones.includes(zone));
  assert.equal(zones.length, new Set(zones).size);
  assert.equal(timeZoneOptions("Nairobi?", "").includes("Nairobi?"), false);
  assert.ok(zones.every(validTimeZone));
});

test("readable labels retain enough location detail without inventing a fixed daylight-saving offset", () => {
  assert.equal(timeZoneLabel("Africa/Nairobi"), "Nairobi · Africa");
  assert.equal(timeZoneLabel("America/New_York"), "New York · America");
  assert.equal(
    timeZoneLabel("America/Argentina/Buenos_Aires"),
    "Buenos Aires · America / Argentina",
  );
  assert.equal(timeZoneLabel("UTC"), "UTC · Coordinated Universal Time");
  assert.equal(timeZoneLabel("Etc/GMT-3"), "Etc/GMT-3");
});

test("browsers without supportedValuesOf retain a complete searchable choice list", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "supportedValuesOf");
  try {
    Object.defineProperty(Intl, "supportedValuesOf", {
      configurable: true,
      value: undefined,
    });
    const zones = timeZoneOptions("Asia/Kolkata", "Africa/Nairobi");
    assert.ok(zones.length > 300);
    assert.ok(zones.includes("Europe/London"));
    assert.ok(zones.includes("Africa/Nairobi"));
    assert.ok(zones.includes("Asia/Kolkata"));
  } finally {
    if (descriptor)
      Object.defineProperty(Intl, "supportedValuesOf", descriptor);
    else Reflect.deleteProperty(Intl, "supportedValuesOf");
  }
});

test("display includes EAT and UTC offset, with date-aware seasonal and fractional-hour offsets", () => {
  const january = new Date("2027-01-01T12:00:00Z"),
    july = new Date("2027-07-01T12:00:00Z");
  assert.equal(
    timeZoneDisplay("Africa/Nairobi", january),
    "Nairobi · EAT · UTC+03:00",
  );
  assert.equal(
    timeZoneDisplay("Africa/Nairobi", july),
    "Nairobi · EAT · UTC+03:00",
  );
  assert.equal(
    timeZoneDisplay("Europe/London", january),
    "London · GMT · UTC+00:00",
  );
  assert.equal(
    timeZoneDisplay("Europe/London", july),
    "London · BST · UTC+01:00",
  );
  assert.equal(
    timeZoneDisplay("America/New_York", january),
    "New York · EST · UTC-05:00",
  );
  assert.equal(
    timeZoneDisplay("America/New_York", july),
    "New York · EDT · UTC-04:00",
  );
  assert.match(timeZoneDisplay("Asia/Kolkata", january), /UTC\+05:30$/);
  assert.match(timeZoneDisplay("Asia/Kathmandu", january), /UTC\+05:45$/);
  assert.equal(timeZoneDisplay("UTC", january), "UTC · UTC+00:00");
  assert.equal(timeZoneDisplay("Bad/Zone", january), "Zone · Bad");
});
