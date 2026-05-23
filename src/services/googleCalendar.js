import { google } from 'googleapis';
import { getOAuth2Client } from './googleAuth.js';
import { logger } from '../utils/logger.js';

/**
 * Returns an authenticated Google Calendar API client.
 */
export async function getCalendarClient() {
  const auth = await getOAuth2Client();
  return google.calendar({ version: 'v3', auth });
}

/**
 * Creates a minimal, temporary Google Calendar event to trigger a phone alarm notification.
 * @returns {Promise<string>} The created Calendar Event ID.
 */
export async function createAlarmEvent(contestName, startTimeSeconds, durationSeconds) {
  const calendar = await getCalendarClient();
  
  const startTime = new Date(startTimeSeconds * 1000);
  const endTime = new Date((startTimeSeconds + durationSeconds) * 1000);

  const cleanName = contestName.replace('Codeforces ', 'CF ').trim();

  logger.info(`Creating temporary calendar alarm event for "${cleanName}"...`);
  
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `[ALARM] ${cleanName}`,
        description: `Temporary alarm reminder for the upcoming Codeforces contest. This calendar event is managed by the CF Sync Agent and will be automatically deleted the moment the contest starts to keep your calendar completely clean and avoid duplicate items.`,
        start: {
          dateTime: startTime.toISOString()
        },
        end: {
          dateTime: endTime.toISOString()
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 15 } // Triggers popup notification / phone alarm 15 minutes before
          ]
        }
      }
    });

    const eventId = res.data.id;
    logger.info(`Successfully created temporary calendar alarm event ID: ${eventId}`);
    return eventId;
  } catch (error) {
    logger.error(`Failed to create calendar alarm event for "${cleanName}":`, error);
    throw error;
  }
}

/**
 * Deletes a Google Calendar event.
 */
export async function deleteAlarmEvent(eventId) {
  if (!eventId) return;
  const calendar = await getCalendarClient();
  
  logger.info(`Deleting temporary calendar alarm event ID: ${eventId}...`);
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId
    });
    logger.info(`Successfully deleted temporary calendar alarm event ID: ${eventId}`);
  } catch (error) {
    // If the event was already manually deleted by the user, handle gracefully
    const msg = String(error.message || error);
    if (msg.includes('404') || msg.includes('410') || msg.includes('notFound')) {
      logger.info(`Calendar alarm event ID ${eventId} was already removed or not found. Skipping.`);
    } else {
      logger.error(`Failed to delete calendar alarm event ID ${eventId}:`, error);
    }
  }
}
