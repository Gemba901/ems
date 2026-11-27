import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "../services/auth.service";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const verify = () => AuthService.verifyIdentifier("employee@example.test");

test("identifier rate limit shows the server's retry time, not account not found", async () => {
    globalThis.fetch = async () => Response.json("Too many attempts. Please try again later.", {
        status: 429, headers: { "Retry-After": "96" },
    });
    await assert.rejects(verify(), /Too many sign-in attempts.*96 seconds/);
});

test("login rate limit without retry time still explains the temporary limit", async () => {
    globalThis.fetch = async () => new Response(null, { status: 429 });
    await assert.rejects(AuthService.login("employee@example.test", "test-password"), /Too many sign-in attempts.*few minutes/);
});

test("HTML and JSON server errors cannot be mistaken for an absent account", async () => {
    for (const response of [
        new Response("<html>Bad gateway</html>", { status: 502 }),
        Response.json({ message: "Internal database exception" }, { status: 500 }),
    ]) {
        globalThis.fetch = async () => response;
        await assert.rejects(verify(), { message: "The sign-in service is temporarily unavailable. Please try again shortly." });
    }
});

test("genuine account lookup failures retain the backend explanation", async () => {
    globalThis.fetch = async () => Response.json({ message: "Account not found! Please contact your administrator." }, { status: 401 });
    await assert.rejects(verify(), /Account not found! Please contact your administrator/);
});

test("JSON-string login failures retain their explanation", async () => {
    globalThis.fetch = async () => Response.json("Invalid credentials", { status: 401 });
    await assert.rejects(AuthService.login("employee@example.test", "test-password"), /Invalid credentials/);
});

test("unexpected empty responses use a neutral verification error", async () => {
    globalThis.fetch = async () => new Response(null, { status: 400 });
    await assert.rejects(verify(), { message: "Unable to verify your account. Please try again." });
});

test("successful identification still returns the password step data", async () => {
    const account = { name: "Test Employee", hasPassword: true };
    globalThis.fetch = async () => Response.json(account);
    assert.deepEqual(await verify(), account);
});
