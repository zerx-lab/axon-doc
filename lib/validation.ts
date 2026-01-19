/**
 * Shared validation utilities
 */

/**
 * Escape special characters for Supabase ilike queries
 * Prevents SQL injection by escaping %, _, and \
 */
export function escapeSearchPattern(input: string): string {
  return input
    .replace(/\\/g, "\\\\")  // Escape backslash first
    .replace(/%/g, "\\%")    // Escape percent
    .replace(/_/g, "\\_");   // Escape underscore
}

/**
 * Validate password strength
 * Requirements: minimum 8 characters, at least one uppercase, one lowercase, one digit
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: "Password must contain at least one digit" };
  }
  return { valid: true };
}

/**
 * Validate and sanitize pagination parameters
 */
export function validatePagination(
  limitParam: string | null,
  pageParam: string | null,
  options: { maxLimit?: number; defaultLimit?: number } = {}
): { limit: number; page: number; offset: number } {
  const { maxLimit = 100, defaultLimit = 20 } = options;

  let limit = parseInt(limitParam || String(defaultLimit));
  let page = parseInt(pageParam || "1");

  // Ensure valid numbers
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (isNaN(page) || page < 1) page = 1;

  // Enforce max limit
  limit = Math.min(limit, maxLimit);

  const offset = (page - 1) * limit;

  return { limit, page, offset };
}

/**
 * Validate URL and check for SSRF risks
 * In development mode, SSRF protection is disabled
 */
export function validateUrl(url: string): { valid: boolean; error?: string; url?: URL } {
  try {
    const parsed = new URL(url);

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: "Only HTTP and HTTPS protocols are allowed" };
    }

    // Skip SSRF checks in development mode
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      return { valid: true, url: parsed };
    }

    // Block localhost and private IPs (production only)
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return { valid: false, error: "Localhost URLs are not allowed" };
    }

    // Block private IP ranges
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const [, a, b, c] = ipv4Match.map(Number);

      // 10.0.0.0/8
      if (a === 10) {
        return { valid: false, error: "Private IP addresses are not allowed" };
      }
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) {
        return { valid: false, error: "Private IP addresses are not allowed" };
      }
      // 192.168.0.0/16
      if (a === 192 && b === 168) {
        return { valid: false, error: "Private IP addresses are not allowed" };
      }
      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) {
        return { valid: false, error: "Link-local addresses are not allowed" };
      }
      // 0.0.0.0
      if (a === 0) {
        return { valid: false, error: "Invalid IP address" };
      }
    }

    return { valid: true, url: parsed };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Validate search query length
 */
export function validateSearchQuery(
  query: string | null,
  maxLength: number = 200
): { valid: boolean; query: string; error?: string } {
  if (!query) {
    return { valid: true, query: "" };
  }

  if (query.length > maxLength) {
    return { valid: false, query: "", error: `Search query must be less than ${maxLength} characters` };
  }

  return { valid: true, query };
}
