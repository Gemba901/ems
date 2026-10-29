import nextJest from "next/jest.js";
export default nextJest({ dir: "./" })({
  testTimeout: 30000,
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/patterns/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/tests/patterns/setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  clearMocks: true,
});
