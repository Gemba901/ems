export const industries = [
  "Agriculture & Food",
  "Automotive",
  "Construction",
  "System Development",
  "Education",
  "Energy & Utilities",
  "Finance & Banking",
  "Food & Beverage",
  "Healthcare",
  "Hospitality & Tourism",
  "Information Technology",
  "Logistics & Transport",
  "Manufacturing",
  "Media & Entertainment",
  "Retail & E-commerce",
  "Telecommunications",
  "Other",
];

export function companySlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
}
export function slugError(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug))
    return "Use 3–40 lowercase letters, numbers or hyphens, with no hyphen at either end.";
  if (
    ["www", "api", "admin", "app", "auth", "staging", "support"].includes(slug)
  )
    return "This address is reserved. Choose another company slug.";
  return "";
}
export async function onboardingRequest<T>(
  action: string,
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/onboarding/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(". ")
        : data.message ||
            "We couldn't complete that request. Please try again.",
    );
  return data as T;
}
