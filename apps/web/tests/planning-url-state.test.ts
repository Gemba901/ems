import test from "node:test";
import assert from "node:assert/strict";
import { setPlanningUrl } from "../components/leadership-excellence/performance-planning/PlanningUrlState";

test("planning URL changes preserve filters and sync Next without reusing its internal history state", (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const calls: { state: unknown; title: string; url: string }[] = [];
  const events: { type: string; href: string }[] = [];
  const location = {
    href: "https://ems.example/leadership-excellence/performance-planning/objectives?cycle=2027&pillar=OPX&search=delivery+%26+quality&edit=old#readiness",
  };
  const browser = {
    location,
    history: {
      state: { __NA: true, tree: ["existing-router-state"] },
      replaceState(state: unknown, title: string, url?: string | URL | null) {
        assert.equal(typeof url, "string");
        calls.push({ state, title, url: String(url) });
        location.href = new URL(String(url), location.href).href;
      },
    },
    dispatchEvent(event: Event) {
      events.push({ type: event.type, href: location.href });
      return true;
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: browser });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  setPlanningUrl({ edit: "goal/department plan/goal&1", finding: "finding#2" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].state, null, "Next must copy its own state so useSearchParams receives the update");
  assert.equal(calls[0].title, "");
  assert.match(calls[0].url, /^\/leadership-excellence\/performance-planning\/objectives\?/);
  assert.match(calls[0].url, /edit=goal%2Fdepartment\+plan%2Fgoal%261/);
  assert.match(calls[0].url, /finding=finding%232/);
  const edited = new URL(location.href);
  assert.equal(edited.searchParams.get("cycle"), "2027");
  assert.equal(edited.searchParams.get("pillar"), "OPX");
  assert.equal(edited.searchParams.get("search"), "delivery & quality");
  assert.equal(edited.searchParams.get("edit"), "goal/department plan/goal&1");
  assert.equal(edited.searchParams.get("finding"), "finding#2");
  assert.equal(edited.hash, "#readiness");
  assert.deepEqual(events, [{ type: "planning-url-change", href: edited.href }]);

  setPlanningUrl({ edit: null, finding: null, search: "" });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].state, null);
  assert.equal(calls[1].url, "/leadership-excellence/performance-planning/objectives?cycle=2027&pillar=OPX#readiness");
  assert.deepEqual(events[1], { type: "planning-url-change", href: location.href });
  assert.equal(events.length, 2);
});
