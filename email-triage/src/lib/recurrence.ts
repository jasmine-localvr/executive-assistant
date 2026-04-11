/**
 * Recurrence helpers — compute next due dates for recurring todos.
 */

interface RecurrenceParams {
  recurrence_type: string;
  recurrence_interval: number;
  recurrence_day_of_week: number | null;
  recurrence_day_of_month: number | null;
  recurrence_month: number | null;
}

/**
 * Compute the first upcoming due date from a recurrence rule, starting from `fromDate`.
 * Used when creating a new recurring todo without an explicit next_due_at.
 */
export function computeNextDue(params: RecurrenceParams, fromDate: Date): string {
  const d = new Date(fromDate);
  // Work in Mountain Time date (strip time component)
  const mt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Denver' }));

  switch (params.recurrence_type) {
    case 'daily':
      mt.setDate(mt.getDate() + params.recurrence_interval);
      break;

    case 'weekly': {
      const targetDay = params.recurrence_day_of_week ?? mt.getDay();
      let daysAhead = targetDay - mt.getDay();
      if (daysAhead <= 0) daysAhead += 7;
      mt.setDate(mt.getDate() + daysAhead);
      break;
    }

    case 'monthly': {
      const targetDom = params.recurrence_day_of_month ?? mt.getDate();
      mt.setMonth(mt.getMonth() + params.recurrence_interval);
      mt.setDate(Math.min(targetDom, daysInMonth(mt.getFullYear(), mt.getMonth())));
      break;
    }

    case 'yearly': {
      const targetMonth = params.recurrence_month != null ? params.recurrence_month - 1 : mt.getMonth();
      const targetDom2 = params.recurrence_day_of_month ?? mt.getDate();
      mt.setFullYear(mt.getFullYear() + params.recurrence_interval);
      mt.setMonth(targetMonth);
      mt.setDate(Math.min(targetDom2, daysInMonth(mt.getFullYear(), targetMonth)));
      break;
    }
  }

  return formatDate(mt);
}

/**
 * Advance a due date forward by one recurrence cycle.
 * Called by the cron after generating a todo instance.
 */
export function advanceDueDate(currentDue: string, params: RecurrenceParams): string {
  const d = new Date(currentDue + 'T12:00:00'); // noon to avoid TZ edge cases

  switch (params.recurrence_type) {
    case 'daily':
      d.setDate(d.getDate() + params.recurrence_interval);
      break;

    case 'weekly':
      d.setDate(d.getDate() + 7 * params.recurrence_interval);
      break;

    case 'monthly': {
      const targetDom = params.recurrence_day_of_month ?? d.getDate();
      d.setMonth(d.getMonth() + params.recurrence_interval);
      d.setDate(Math.min(targetDom, daysInMonth(d.getFullYear(), d.getMonth())));
      break;
    }

    case 'yearly': {
      const targetMonth = params.recurrence_month != null ? params.recurrence_month - 1 : d.getMonth();
      const targetDom2 = params.recurrence_day_of_month ?? d.getDate();
      d.setFullYear(d.getFullYear() + params.recurrence_interval);
      d.setMonth(targetMonth);
      d.setDate(Math.min(targetDom2, daysInMonth(d.getFullYear(), targetMonth)));
      break;
    }
  }

  return formatDate(d);
}

/**
 * Build a human-readable schedule label.
 * e.g. "Every month on the 15th", "Every year on April 1"
 */
export function formatRecurrenceLabel(params: {
  recurrence_type: string;
  recurrence_interval: number;
  recurrence_day_of_week: number | null;
  recurrence_day_of_month: number | null;
  recurrence_month: number | null;
}): string {
  const interval = params.recurrence_interval;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  switch (params.recurrence_type) {
    case 'daily':
      return interval === 1 ? 'Every day' : `Every ${interval} days`;

    case 'weekly': {
      const dayLabel = params.recurrence_day_of_week != null
        ? ` on ${dayNames[params.recurrence_day_of_week]}`
        : '';
      return interval === 1 ? `Every week${dayLabel}` : `Every ${interval} weeks${dayLabel}`;
    }

    case 'monthly': {
      const domLabel = params.recurrence_day_of_month
        ? ` on the ${ordinal(params.recurrence_day_of_month)}`
        : '';
      return interval === 1 ? `Every month${domLabel}` : `Every ${interval} months${domLabel}`;
    }

    case 'yearly': {
      const mLabel = params.recurrence_month != null
        ? monthNames[params.recurrence_month - 1]
        : '';
      const dLabel = params.recurrence_day_of_month ?? '';
      const dateStr = mLabel && dLabel ? ` on ${mLabel} ${dLabel}` : mLabel ? ` in ${mLabel}` : '';
      return interval === 1 ? `Every year${dateStr}` : `Every ${interval} years${dateStr}`;
    }

    default:
      return 'Custom schedule';
  }
}

// ── Helpers ──

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
