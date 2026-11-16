/**
 * Enrollment Number Generator
 * Handles RGPV-style enrollment numbers like: 0133CS241001
 * Format: [College Code][Branch][Year][Number]
 */

/**
 * Parse enrollment number to extract prefix and numeric suffix.
 * Finds the longest trailing numeric sequence.
 */
function parseEnrollment(enrollment) {
      const match = enrollment.match(/^(.*?)(\d+)$/);
      if (!match) return null;
      return {
            prefix: match[1],
            suffix: match[2],
            suffixLength: match[2].length,
            numericValue: parseInt(match[2], 10),
      };
}

/**
 * Generate a list of enrollment numbers from start to end.
 * Validates common prefix and numeric suffix length.
 */
function generateEnrollments(startEnrollment, endEnrollment) {
      const errors = [];

      if (!startEnrollment || !endEnrollment) {
            errors.push('Starting and ending enrollment numbers are required');
            return { success: false, errors };
      }

      const start = parseEnrollment(startEnrollment.trim());
      const end = parseEnrollment(endEnrollment.trim());

      if (!start) {
            errors.push('Starting enrollment number format is invalid');
      }
      if (!end) {
            errors.push('Ending enrollment number format is invalid');
      }
      if (errors.length) return { success: false, errors };

      if (start.prefix !== end.prefix) {
            errors.push(`Prefix mismatch: "${start.prefix}" vs "${end.prefix}". Both must share the same prefix.`);
      }
      if (start.suffixLength !== end.suffixLength) {
            errors.push(`Numeric suffix length mismatch: ${start.suffixLength} vs ${end.suffixLength} digits`);
      }
      if (errors.length) return { success: false, errors };

      if (start.numericValue > end.numericValue) {
            errors.push(`Starting number (${start.numericValue}) must be less than or equal to ending number (${end.numericValue})`);
            return { success: false, errors };
      }

      const count = end.numericValue - start.numericValue + 1;
      if (count > 1000) {
            errors.push(`Range too large: ${count} enrollment numbers. Maximum allowed is 1000.`);
            return { success: false, errors };
      }

      const enrollments = [];
      for (let i = start.numericValue; i <= end.numericValue; i++) {
            const suffix = String(i).padStart(start.suffixLength, '0');
            enrollments.push(start.prefix + suffix);
      }

      return {
            success: true,
            enrollments,
            total: enrollments.length,
            prefix: start.prefix,
            firstEnrollment: enrollments[0],
            lastEnrollment: enrollments[enrollments.length - 1],
            suffixLength: start.suffixLength,
      };
}

/**
 * Validate a single enrollment number format.
 */
function validateEnrollment(enrollment) {
      if (!enrollment || typeof enrollment !== 'string') return false;
      const trimmed = enrollment.trim();
      if (trimmed.length < 4 || trimmed.length > 20) return false;
      return /^[A-Z0-9]+\d{4,8}$/.test(trimmed.toUpperCase());
}

/**
 * Deduplicate enrollment list.
 */
function deduplicateEnrollments(list) {
      const seen = new Set();
      const unique = [];
      const duplicates = [];

      for (const e of list) {
            const normalized = e.trim().toUpperCase();
            if (seen.has(normalized)) {
                  duplicates.push(e);
            } else {
                  seen.add(normalized);
                  unique.push(e.trim());
            }
      }

      return { unique, duplicates, duplicateCount: duplicates.length };
}

module.exports = { generateEnrollments, parseEnrollment, validateEnrollment, deduplicateEnrollments };
