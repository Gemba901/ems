import { getOrganizationSlugError, RESERVED_ORGANIZATION_SLUGS } from "src/common/utils/organization-slug"

export type TenantHostnameResult = 
    | {kind: 'tenant'; slug: string}
    | {kind: 'platform'}
    | {kind: 'invalid'}

function isValidHostname(value: string) : boolean{
    if (!value || value.length > 253) return false

    // Accept DNS hostname labels only: no URLs, ports, paths,
    // whitespace, empty labels, or leading/trailing hyphens.

    return value.split('.').every(
        (label) =>
            label.length >= 1 &&
            label.length <= 63 &&
            /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
}

export function parseTenantHostname(hostname: string, baseDomain: string): TenantHostnameResult{

    if (!isValidHostname(hostname) || !isValidHostname(baseDomain)) {
        return { kind: 'invalid' };
    }

    const normalizedHostname = hostname.toLowerCase();
    const normalizedBase = baseDomain.toLowerCase();

    if (normalizedHostname === normalizedBase) {
        return { kind: 'platform' };
    }

    const suffix = `.${normalizedBase}`
    
    if (!normalizedHostname.endsWith(suffix)) {
        return { kind: 'invalid' };
    }

    const slug = normalizedHostname.slice(0, -suffix.length);

    // Initially support exactly one company label.
    if (!slug || slug.includes('.')) {
        return { kind: 'invalid' };
    }

    // Check before slug validation, which rejects reserved names.
    if (RESERVED_ORGANIZATION_SLUGS.has(slug)) {
        return { kind: 'platform' };
    }

    if (getOrganizationSlugError(slug)) {
        return { kind: 'invalid' };
    }

    return { kind: 'tenant', slug };
} 
