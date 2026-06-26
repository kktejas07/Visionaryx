import { format } from 'date-fns';

/**
 * Format date for display. Uses consistent format to avoid hydration mismatches.
 */
export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return format(d, 'MMM d, yyyy h:mm a');
  } catch {
    return isoString;
  }
}
