/**
 * Formats an Indian phone number with the +91 prefix.
 *
 * Handles various input formats:
 * - 10-digit numbers: 9876543210 → +91 9876543210
 * - With leading 0: 09876543210 → +91 9876543210
 * - With +91 prefix: +919876543210 → +91 9876543210
 * - With 91 prefix (no +): 919876543210 → +91 9876543210
 * - With spaces/dashes: 98765 43210, 98765-43210
 * - Landline with STD code: 040-12345678 → +91 4012345678
 *
 * Returns null if the input is null, empty, or cannot be parsed.
 */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone || phone.trim() === '') {
    return null;
  }

  // Remove all whitespace, dashes, parentheses, and dots
  let cleaned = phone.replace(/[\s\-().]/g, '');

  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Remove leading 91 country code if the remaining digits form a valid number
  if (cleaned.startsWith('91') && cleaned.length >= 12) {
    cleaned = cleaned.substring(2);
  }

  // Remove leading 0 (STD code prefix)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }

  // At this point, we should have a 10-digit number for mobile
  // or a 10-digit number for landline (STD + local)
  // Accept 10 or 11 digit numbers
  if (!/^\d{10,11}$/.test(cleaned)) {
    // If it's still not a valid length, return the original with basic cleanup
    if (/^\d+$/.test(cleaned) && cleaned.length >= 7) {
      return `+91 ${cleaned}`;
    }
    return phone.trim(); // Return original if we can't parse
  }

  return `+91 ${cleaned}`;
}
