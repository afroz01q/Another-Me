// ====================================================================
// ANOTHER ME — SECTION 5.1: DATABASE DESTINATION & SSRF SECURITY
// Validates user-supplied database connection strings against:
// 1. Prohibited schemes (http, ftp, gopher, dict, etc.)
// 2. Private, link-local, loopback, and internal IP address destinations
// 3. Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
// 4. DNS rebinding via multi-IP lookup validation
// 5. Host port restrictions blocking privileged/internal services
// 6. Strict credential redaction in logs, responses, and errors
// ====================================================================

import dns from 'dns'
import net from 'net'

export interface DatabaseDestinationValidationResult {
  allowed: boolean
  scheme?: string
  hostname?: string
  port?: number
  resolvedIps?: string[]
  pinnedIp?: string
  sanitizedUrl?: string
  error?: string
  code?: string
}

// Prohibited internal/service ports that must never be targeted
const RESTRICTED_PORTS = new Set([
  22,    // SSH
  23,    // Telnet
  25,    // SMTP
  80,    // HTTP
  443,   // HTTPS
  2375,  // Docker daemon (unencrypted)
  2376,  // Docker daemon (TLS)
  3000,  // Common app internal port
  5000,  // Docker registry / Flask
  5173,  // Vite dev server
  6379,  // Redis
  8080,  // Common internal proxy
  8500,  // Consul
  9200,  // Elasticsearch
  10250, // Kubelet
  10255, // Kubelet readonly
])

// Prohibited hostnames
const PROHIBITED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'host.docker.internal',
  'gateway.docker.internal',
  'metadata.google.internal',
  'instance-data',
  'metadata',
])

/**
 * Normalizes unusual IP representations (decimal integers, hex, octal, dotted-hex,
 * leading zeros, IPv4-mapped IPv6, IPv4-compatible IPv6, and scoped IPv6) into canonical form.
 */
export function normalizeIpAddress(raw: string): { isIp: boolean; canonicalIp?: string; family?: 4 | 6 } {
  if (!raw || typeof raw !== 'string') return { isIp: false }
  let input = raw.trim().replace(/^\[|\]$/g, '') // Strip outer IPv6 brackets

  // Strip IPv6 scope ID if present (e.g. fe80::1%eth0)
  if (input.includes('%')) {
    input = input.slice(0, input.indexOf('%'))
  }

  // 1. Pure decimal integer (e.g. 2130706433 = 127.0.0.1, 2852039166 = 169.254.169.254)
  if (/^\d+$/.test(input)) {
    const num = Number(input)
    if (num >= 0 && num <= 0xffffffff) {
      const canonicalIp = [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255,
      ].join('.')
      return { isIp: true, canonicalIp, family: 4 }
    }
  }

  // 2. Pure hexadecimal integer (e.g. 0x7f000001 = 127.0.0.1, 0xa9fea9fe = 169.254.169.254)
  if (/^0x[0-9a-fA-F]+$/i.test(input)) {
    const num = parseInt(input, 16)
    if (num >= 0 && num <= 0xffffffff) {
      const canonicalIp = [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255,
      ].join('.')
      return { isIp: true, canonicalIp, family: 4 }
    }
  }

  // 3. Dotted notation with octal, hex, or decimal parts (e.g. 0177.0.0.1, 0x7f.0.0.1, 127.000.000.001)
  const parts = input.split('.')
  if (parts.length >= 2 && parts.length <= 4) {
    const parsedParts: number[] = []
    let valid = true
    for (const part of parts) {
      if (/^0x[0-9a-fA-F]+$/i.test(part)) {
        parsedParts.push(parseInt(part, 16))
      } else if (/^0[0-7]+$/.test(part) && part !== '0') {
        parsedParts.push(parseInt(part, 8))
      } else if (/^\d+$/.test(part)) {
        parsedParts.push(parseInt(part, 10))
      } else {
        valid = false
        break
      }
    }

    if (valid && parsedParts.length === 4 && parsedParts.every((p) => p >= 0 && p <= 255)) {
      return { isIp: true, canonicalIp: parsedParts.join('.'), family: 4 }
    }
    // Handle short dotted notation (e.g. 127.1 = 127.0.0.1)
    if (valid && parsedParts.length === 2 && parsedParts[0] >= 0 && parsedParts[0] <= 255 && parsedParts[1] >= 0 && parsedParts[1] <= 0xffffff) {
      const last = parsedParts[1]
      return {
        isIp: true,
        canonicalIp: [parsedParts[0], (last >>> 16) & 255, (last >>> 8) & 255, last & 255].join('.'),
        family: 4,
      }
    }
  }

  // 4. IPv4-compatible or IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::127.0.0.1 or ::ffff:7f00:1)
  const lower = input.toLowerCase()
  if (lower.startsWith('::ffff:') || lower.startsWith('::')) {
    const lastColon = lower.lastIndexOf(':')
    const suffix = lower.slice(lastColon + 1)
    if (suffix.includes('.')) {
      const subNorm = normalizeIpAddress(suffix)
      if (subNorm.isIp && subNorm.canonicalIp) {
        return subNorm
      }
    }
  }

  // Standard net.isIP
  const std = net.isIP(input)
  if (std === 4) return { isIp: true, canonicalIp: input, family: 4 }
  if (std === 6) return { isIp: true, canonicalIp: input, family: 6 }

  return { isIp: false }
}

/**
 * Checks whether an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
function isRestrictedIpv4(ip: string): { restricted: boolean; reason?: string } {
  const norm = normalizeIpAddress(ip)
  const targetIp = norm.isIp && norm.canonicalIp ? norm.canonicalIp : ip
  const parts = targetIp.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return { restricted: true, reason: 'Malformed IPv4 address' }
  }

  const [b0, b1] = parts

  // Loopback (127.0.0.0/8)
  if (b0 === 127) {
    return { restricted: true, reason: 'Loopback destination (127.0.0.0/8) is restricted' }
  }

  // Link-Local / Cloud Metadata (169.254.0.0/16)
  if (b0 === 169 && b1 === 254) {
    return { restricted: true, reason: 'Link-local / cloud metadata (169.254.0.0/16) is restricted' }
  }

  // Current network (0.0.0.0/8)
  if (b0 === 0) {
    return { restricted: true, reason: 'Current network (0.0.0.0/8) is restricted' }
  }

  // RFC 1918 Private Class A (10.0.0.0/8)
  if (b0 === 10) {
    return { restricted: true, reason: 'Private network (10.0.0.0/8) is restricted' }
  }

  // RFC 1918 Private Class B (172.16.0.0/12)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) {
    return { restricted: true, reason: 'Private network (172.16.0.0/12) is restricted' }
  }

  // RFC 1918 Private Class C (192.168.0.0/16)
  if (b0 === 192 && b1 === 168) {
    return { restricted: true, reason: 'Private network (192.168.0.0/16) is restricted' }
  }

  // Carrier-Grade NAT (100.64.0.0/10)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) {
    return { restricted: true, reason: 'Carrier-grade NAT (100.64.0.0/10) is restricted' }
  }

  // Multicast (224.0.0.0/4)
  if (b0 >= 224 && b0 <= 239) {
    return { restricted: true, reason: 'Multicast address range is restricted' }
  }

  // Reserved / Future Use (240.0.0.0/4)
  if (b0 >= 240) {
    return { restricted: true, reason: 'Reserved address range is restricted' }
  }

  return { restricted: false }
}

/**
 * Checks whether an IPv6 address is in a restricted range.
 */
function isRestrictedIpv6(ip: string): { restricted: boolean; reason?: string } {
  let norm = ip.toLowerCase().trim().replace(/^\[|\]$/g, '')
  if (norm.includes('%')) {
    norm = norm.slice(0, norm.indexOf('%'))
  }

  if (norm === '::1' || norm === '0:0:0:0:0:0:0:1') {
    return { restricted: true, reason: 'IPv6 loopback (::1) is restricted' }
  }
  if (norm === '::' || norm === '0:0:0:0:0:0:0:0') {
    return { restricted: true, reason: 'IPv6 unspecified address is restricted' }
  }
  if (norm.startsWith('fe80:') || norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) {
    return { restricted: true, reason: 'IPv6 link-local address is restricted' }
  }
  if (norm.startsWith('fc00:') || norm.startsWith('fd')) {
    return { restricted: true, reason: 'IPv6 unique local address (ULA) is restricted' }
  }
  if (norm.startsWith('::ffff:') || norm.startsWith('::')) {
    // IPv4-mapped or compatible IPv6 address -> check IPv4 portion
    const ipv4Normalized = normalizeIpAddress(norm)
    if (ipv4Normalized.isIp && ipv4Normalized.canonicalIp) {
      return isRestrictedIpv4(ipv4Normalized.canonicalIp)
    }
  }
  return { restricted: false }
}

/**
 * Redacts passwords and sensitive tokens from database connection strings.
 */
export function redactDatabaseCredentials(input: string): string {
  if (!input || typeof input !== 'string') return input
  // Replace password in URI: postgres://user:password@host:port/db
  return input
    .replace(/(postgres(?:ql)?|mysql|mariadb):\/\/([^:]+):([^@]+)@/gi, '$1://$2:[REDACTED]@')
    .replace(/(password|secret|key|token)=([^&\s;]+)/gi, '$1=[REDACTED]')
}

/**
 * Validates a user-supplied DATABASE_URL against SSRF, internal services, and metadata access.
 */
export async function validateDatabaseDestination(
  databaseUrl: string
): Promise<DatabaseDestinationValidationResult> {
  if (!databaseUrl || typeof databaseUrl !== 'string') {
    return {
      allowed: false,
      error: 'Database connection URL is required.',
      code: 'MISSING_DATABASE_URL',
    }
  }

  const trimmed = databaseUrl.trim()

  // 1. Validate URI scheme
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    // Check if it's a relative SQLite file path
    if (trimmed.startsWith('sqlite:') || trimmed.startsWith('file:') || trimmed.endsWith('.db') || trimmed.endsWith('.sqlite')) {
      return {
        allowed: true,
        scheme: 'sqlite',
        sanitizedUrl: redactDatabaseCredentials(trimmed),
      }
    }
    return {
      allowed: false,
      error: 'Malformed database connection URL.',
      code: 'INVALID_DATABASE_URL',
    }
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase()
  const allowedSchemes = ['postgresql', 'postgres', 'mysql', 'mariadb', 'sqlite']

  if (!allowedSchemes.includes(scheme)) {
    return {
      allowed: false,
      scheme,
      error: `Unsupported database scheme "${scheme}". Allowed schemes: ${allowedSchemes.join(', ')}.`,
      code: 'UNSUPPORTED_SCHEME',
    }
  }

  if (scheme === 'sqlite') {
    return {
      allowed: true,
      scheme: 'sqlite',
      sanitizedUrl: redactDatabaseCredentials(trimmed),
    }
  }

  // 2. Validate hostname
  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) {
    return {
      allowed: false,
      scheme,
      error: 'Database URL is missing a valid hostname.',
      code: 'MISSING_HOSTNAME',
    }
  }

  if (
    PROHIBITED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return {
      allowed: false,
      scheme,
      hostname,
      error: `Access Denied: Destination hostname "${hostname}" is an internal, loopback, or metadata service.`,
      code: 'BLOCKED_INTERNAL_DESTINATION',
    }
  }

  // 3. Validate port
  const port = parsed.port ? parseInt(parsed.port, 10) : scheme.startsWith('postgres') ? 5432 : 3306
  if (RESTRICTED_PORTS.has(port)) {
    return {
      allowed: false,
      scheme,
      hostname,
      port,
      error: `Access Denied: Port ${port} is restricted to prevent unauthorized service access.`,
      code: 'BLOCKED_PORT',
    }
  }

  // 4. IP Literal & Unusual Encoding Check
  // Check if the hostname normalizes to an IP address (handles decimal integers, hex, octal, dotted-hex, leading zeros, IPv4-mapped IPv6, scoped IPv6)
  const normHost = normalizeIpAddress(hostname)
  if (normHost.isIp && normHost.canonicalIp) {
    const check = normHost.family === 6 ? isRestrictedIpv6(normHost.canonicalIp) : isRestrictedIpv4(normHost.canonicalIp)
    if (check.restricted) {
      return {
        allowed: false,
        scheme,
        hostname,
        port,
        resolvedIps: [normHost.canonicalIp],
        error: `Access Denied: Destination IP address is restricted (${check.reason}).`,
        code: 'BLOCKED_INTERNAL_DESTINATION',
      }
    }
    return {
      allowed: true,
      scheme,
      hostname,
      port,
      resolvedIps: [normHost.canonicalIp],
      sanitizedUrl: redactDatabaseCredentials(trimmed),
    }
  }

  // 5. Domain Name DNS Resolution & Rebinding Check
  // Resolve via DNS and verify ALL resolved IPs across both IPv4 and IPv6
  try {
    const lookupResults = await dns.promises.lookup(hostname, { all: true })
    if (!lookupResults || lookupResults.length === 0) {
      return {
        allowed: false,
        scheme,
        hostname,
        port,
        error: `Unable to resolve database hostname "${hostname}".`,
        code: 'DNS_RESOLUTION_FAILED',
      }
    }

    const resolvedIps = lookupResults.map((r) => r.address)

    for (const record of lookupResults) {
      const normResolved = normalizeIpAddress(record.address)
      const ipToCheck = normResolved.isIp && normResolved.canonicalIp ? normResolved.canonicalIp : record.address
      const check = record.family === 6 ? isRestrictedIpv6(ipToCheck) : isRestrictedIpv4(ipToCheck)
      if (check.restricted) {
        return {
          allowed: false,
          scheme,
          hostname,
          port,
          resolvedIps,
          error: `Access Denied: Hostname "${hostname}" resolves to restricted IP "${record.address}" (${check.reason}).`,
          code: 'BLOCKED_INTERNAL_DESTINATION',
        }
      }
    }

    // Dual-Family Multi-Record Inspection:
    // Query IPv4 and IPv6 directly to inspect all multi-homed records across both protocols.
    // NOTE: Dual resolution inspects multi-homed records, but does NOT alone prevent post-resolution DNS rebinding.
    // True DNS rebinding protection requires container host-pinning (--add-host) and kernel-level egress firewalls.
    try {
      const [ipv4Addresses, ipv6Addresses] = await Promise.allSettled([
        dns.promises.resolve4(hostname).catch(() => [] as string[]),
        dns.promises.resolve6(hostname).catch(() => [] as string[]),
      ])

      const allExtraIps = [
        ...(ipv4Addresses.status === 'fulfilled' ? ipv4Addresses.value : []),
        ...(ipv6Addresses.status === 'fulfilled' ? ipv6Addresses.value : []),
      ]

      for (const extraIp of allExtraIps) {
        if (!resolvedIps.includes(extraIp)) {
          resolvedIps.push(extraIp)
        }
        const norm = normalizeIpAddress(extraIp)
        const canonical = norm.isIp && norm.canonicalIp ? norm.canonicalIp : extraIp
        const isFam6 = net.isIP(canonical) === 6
        const check = isFam6 ? isRestrictedIpv6(canonical) : isRestrictedIpv4(canonical)
        if (check.restricted) {
          return {
            allowed: false,
            scheme,
            hostname,
            port,
            resolvedIps,
            error: `Access Denied: Hostname "${hostname}" resolves to restricted IP "${extraIp}" (${check.reason}).`,
            code: 'BLOCKED_INTERNAL_DESTINATION',
          }
        }
      }
    } catch {}

    return {
      allowed: true,
      scheme,
      hostname,
      port,
      resolvedIps,
      pinnedIp: resolvedIps[0],
      sanitizedUrl: redactDatabaseCredentials(trimmed),
    }
  } catch (dnsErr: any) {
    return {
      allowed: false,
      scheme,
      hostname,
      port,
      error: `DNS resolution failed for hostname "${hostname}": ${dnsErr.message}`,
      code: 'DNS_RESOLUTION_FAILED',
    }
  }
}
