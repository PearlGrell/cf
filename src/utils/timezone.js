import { settings } from '../config/settings.js';

/**
 * Formats a Unix timestamp (in seconds) into a human-readable local time string.
 */
export function formatInTimezone(unixTimestampSeconds, type = 'full') {
  const date = new Date(unixTimestampSeconds * 1000);
  
  if (type === 'short-time') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: settings.TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(date);
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: settings.TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

/**
 * Formats duration in seconds to a human-friendly string (e.g., "2h", "2h 30m").
 */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  }
  return `${minutes}m`;
}
