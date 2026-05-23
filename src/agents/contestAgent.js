import * as db from '../repositories/database.js';
import * as cf from '../services/codeforces.js';
import * as gt from '../services/googleTasks.js';
import * as cal from '../services/googleCalendar.js';
import { formatInTimezone, formatDuration } from '../utils/timezone.js';
import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';

/**
 * Sync Cycle 1: Fetches upcoming contests from Codeforces, records in SQLite,
 * and creates corresponding Google Tasks.
 */
export async function syncUpcomingContests() {
  logger.info('--- Starting UPCOMING Contest Sync ---');
  try {
    const cfContests = await cf.fetchContests();
    const now = Math.floor(Date.now() / 1000);
    
    const upcoming = cfContests.filter(c => {
      const startTime = c.startTimeSeconds || 0;
      return c.phase === 'BEFORE' || startTime > now;
    });
    
    logger.info(`Found ${upcoming.length} upcoming contests from Codeforces API.`);
    let createdCount = 0;
    let updatedCount = 0;

    for (const c of upcoming) {
      const startTime = c.startTimeSeconds || (now + 86400);
      const endTime = startTime + c.durationSeconds;
      
      const existing = await db.getContest(c.id);
      
      if (existing) {
        if (existing.contest_name !== c.name || existing.start_time !== startTime || existing.end_time !== endTime) {
          // If start time changed, recreate the calendar alarm at the new time
          if (existing.calendar_event_id) {
            try {
              await cal.deleteAlarmEvent(existing.calendar_event_id);
              existing.calendar_event_id = null;
            } catch (err) {
              logger.warn(`Failed to delete old alarm for ${c.id}: ${err.message}`);
            }
          }
          
          existing.contest_name = c.name;
          existing.start_time = startTime;
          existing.end_time = endTime;
          existing.last_synced = now;

          // Create new alarm event at the updated time
          try {
            existing.calendar_event_id = await cal.createAlarmEvent(existing.contest_name, startTime, c.durationSeconds);
          } catch (err) {
            logger.error(`Could not create updated calendar alarm for contest ${c.id}:`, err);
          }
          
          if (existing.task_id) {
            try {
              const notes = buildTaskDescription(existing);
              const title = buildTaskTitle(existing);
              const due = new Date(existing.start_time * 1000).toISOString();
              await gt.updateTask(existing.task_id, title, notes, due);
            } catch (err) {
              logger.warn(`Failed to sync task update for contest ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          
          await db.upsertContest(existing);
          updatedCount++;
        }
      } else {
        const newContest = {
          contest_id: c.id,
          contest_name: c.name,
          start_time: startTime,
          end_time: endTime,
          status: 'scheduled',
          task_id: null,
          attempted: 0,
          solved: 0,
          wrong_submissions: 0,
          rank: null,
          rating_change: null,
          last_synced: now,
          calendar_event_id: null
        };

        // 1. Create Google Task
        const notes = buildTaskDescription(newContest);
        const title = buildTaskTitle(newContest);
        const due = new Date(newContest.start_time * 1000).toISOString();
        
        try {
          const taskId = await gt.createTask(title, notes, due);
          newContest.task_id = taskId;
        } catch (err) {
          logger.error(`Could not create Google Task for contest ${c.id}:`, err);
        }

        // 2. Create Calendar Alarm Event
        try {
          const eventId = await cal.createAlarmEvent(newContest.contest_name, newContest.start_time, c.durationSeconds);
          newContest.calendar_event_id = eventId;
        } catch (err) {
          logger.error(`Could not create Google Calendar Alarm Event for contest ${c.id}:`, err);
        }
        
        await db.upsertContest(newContest);
        createdCount++;
      }
    }
    
    logger.info(`Upcoming Sync finished: ${createdCount} created, ${updatedCount} updated.`);
    await db.logSync('upcoming', 'SUCCESS', `Created ${createdCount}, Updated ${updatedCount}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed upcoming contest synchronization:', error);
    await db.logSync('upcoming', 'FAILED', errorMsg);
    throw error;
  }
}

/**
 * Sync Cycle 2: Monitors active/live contests.
 */
export async function syncLiveContests() {
  logger.info('--- Starting LIVE Contest Monitoring ---');
  try {
    const now = Math.floor(Date.now() / 1000);
    const scheduledContests = await db.getContestsByStatus(['scheduled']);
    
    let liveCount = 0;
    
    for (const contest of scheduledContests) {
      if (now >= contest.start_time) {
        logger.info(`Contest starting! Transitioning ID ${contest.contest_id} "${contest.contest_name}" to LIVE`);
        
        contest.status = 'live';
        contest.last_synced = now;

        // Delete temporary Google Calendar Alarm event to clean up the user's calendar view immediately
        if (contest.calendar_event_id) {
          try {
            await cal.deleteAlarmEvent(contest.calendar_event_id);
            contest.calendar_event_id = null;
          } catch (err) {
            logger.warn(`Failed to delete calendar alarm for live contest ${contest.contest_id}: ${err.message}`);
          }
        }
        
        if (contest.task_id) {
          try {
            const title = buildTaskTitle(contest);
            const notes = buildTaskDescription(contest);
            const due = new Date(contest.start_time * 1000).toISOString();
            await gt.updateTask(contest.task_id, title, notes, due);
          } catch (err) {
            logger.warn(`Failed to update task for live transition: ${err instanceof Error ? err.message : String(err)}`);
            if (isGoogleTaskNotFoundError(err)) {
              contest.task_id = null;
            }
          }
        }
        
        await db.upsertContest(contest);
        liveCount++;
      }
    }
    
    logger.info(`Live Monitoring finished: ${liveCount} contests transitioned to live.`);
    await db.logSync('live', 'SUCCESS', `Transitioned ${liveCount} to LIVE`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed live contest monitoring:', error);
    await db.logSync('live', 'FAILED', errorMsg);
    throw error;
  }
}

/**
 * Sync Cycle 3: Processes ended contests, tracks submissions, fetches rating changes,
 * and handles cleanup/retention of missed tasks.
 */
export async function syncCleanupAndArchival() {
  logger.info('--- Starting CLEANUP and ARCHIVAL Sync ---');
  const now = Math.floor(Date.now() / 1000);
  let processedCount = 0;
  let deletedCount = 0;
  
  try {
    const endedLive = await db.getContestsByStatus(['live']);
    const newlyEnded = endedLive.filter(c => c.end_time < now);
    
    if (newlyEnded.length > 0) {
      logger.info(`Found ${newlyEnded.length} contests that have recently ended. Computing user participation...`);
      
      const submissions = settings.CF_HANDLE ? await cf.fetchUserSubmissions(settings.CF_HANDLE) : [];
      
      for (const contest of newlyEnded) {
        const stats = cf.computeContestParticipation(
          submissions,
          contest.contest_id,
          contest.start_time,
          contest.end_time
        );
        
        if (stats.hasActivity) {
          contest.attempted = 1;
          contest.solved = stats.solvedCount;
          contest.wrong_submissions = stats.wrongCount;
          contest.solved_list = stats.solvedList.join(', ');
          contest.unsolved_list = stats.unsolvedList.join(', ');
          contest.status = stats.solvedCount > 0 ? 'attempted' : 'partial';
          logger.info(`User participated in ${contest.contest_name} (Solved: ${stats.solvedCount}, Wrong: ${stats.wrongCount}). Status: ${contest.status}`);
        } else {
          contest.status = 'missed';
          logger.info(`User missed contest: ${contest.contest_name}`);
        }
        
        contest.last_synced = now;

        // Defensive check: Ensure any orphaned temporary Google Calendar Alarm events are cleaned up
        if (contest.calendar_event_id) {
          try {
            await cal.deleteAlarmEvent(contest.calendar_event_id);
            contest.calendar_event_id = null;
          } catch (err) {
            logger.warn(`Failed to delete calendar alarm for ended contest ${contest.contest_id}: ${err.message}`);
          }
        }
        
        if (contest.task_id) {
          try {
            const title = buildTaskTitle(contest);
            const notes = buildTaskDescription(contest);
            const due = new Date(contest.start_time * 1000).toISOString();
            await gt.updateTask(contest.task_id, title, notes, due);
          } catch (err) {
            logger.warn(`Failed to update Google Task for ended contest ${contest.contest_id}: ${err instanceof Error ? err.message : String(err)}`);
            if (isGoogleTaskNotFoundError(err)) {
              contest.task_id = null;
            }
          }
        }
        
        await db.upsertContest(contest);
        processedCount++;
      }
    }

    const activeStatsContests = await db.getContestsByStatus(['attempted', 'partial']);
    const pendingRatings = activeStatsContests.filter(c => c.rating_change === null || c.rank === null);
    
    if (pendingRatings.length > 0 && settings.CF_HANDLE) {
      logger.info(`Found ${pendingRatings.length} completed contests with pending rating/rank updates.`);
      const ratingChanges = await cf.fetchUserRatingChanges(settings.CF_HANDLE);
      
      for (const contest of pendingRatings) {
        const match = ratingChanges.find(r => r.contestId === contest.contest_id);
        if (match) {
          const delta = match.newRating - match.oldRating;
          contest.rank = match.rank;
          contest.rating_change = delta;
          contest.status = 'archived';
          contest.last_synced = now;
          
          logger.info(`Rating locked for ${contest.contest_name}: Rank ${match.rank}, Rating Delta: ${delta > 0 ? '+' : ''}${delta}`);
          
          if (contest.task_id) {
            try {
              const title = buildTaskTitle(contest);
              const notes = buildTaskDescription(contest);
              const due = new Date(contest.start_time * 1000).toISOString();
              await gt.updateTask(contest.task_id, title, notes, due);
            } catch (err) {
              logger.warn(`Failed to archive Google Task for ${contest.contest_id}: ${err instanceof Error ? err.message : String(err)}`);
              if (isGoogleTaskNotFoundError(err)) {
                contest.task_id = null;
              }
            }
          }
          await db.upsertContest(contest);
        } else {
          const fiveDaysInSeconds = 5 * 24 * 60 * 60;
          if (now - contest.end_time > fiveDaysInSeconds) {
            logger.info(`Contest ${contest.contest_name} ended >5 days ago without rating updates. Archiving.`);
            contest.status = 'archived';
            contest.last_synced = now;
            await db.upsertContest(contest);
          }
        }
      }
    }

    if (settings.DELETE_UNATTEMPTED) {
      const toDelete = await db.getMissedContestsToDelete(settings.MISSED_RETENTION_DAYS);
      if (toDelete.length > 0) {
        logger.info(`Found ${toDelete.length} expired unattempted contests older than ${settings.MISSED_RETENTION_DAYS} days to delete.`);
        
        for (const contest of toDelete) {
          if (contest.task_id) {
            try {
              await gt.deleteTask(contest.task_id);
            } catch (err) {
              logger.warn(`Failed to delete Google Task ID ${contest.task_id} for missed contest ${contest.contest_id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          
          contest.status = 'deleted';
          contest.task_id = null;
          contest.last_synced = now;
          await db.upsertContest(contest);
          deletedCount++;
        }
      }
    }

    logger.info(`Cleanup Sync finished: ${processedCount} participation processed, ${deletedCount} missed tasks deleted.`);
    await db.logSync('cleanup', 'SUCCESS', `Processed ${processedCount}, Deleted ${deletedCount}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Failed cleanup and archival synchronization:', error);
    await db.logSync('cleanup', 'FAILED', errorMsg);
    throw error;
  }
}

/**
 * Builds the Google Task title based on contest state.
 */
function buildTaskTitle(contest) {
  const shortName = contest.contest_name.replace('Codeforces ', 'CF ').trim();
  
  switch (contest.status) {
    case 'scheduled': {
      const timeStr = formatInTimezone(contest.start_time, 'short-time');
      return `[UPCOMING] [${timeStr}] ${shortName}`;
    }
    case 'live':
      return `[LIVE 🔴] ${shortName}`;
    case 'attempted':
    case 'partial':
    case 'archived':
      if (contest.rating_change !== null) {
        const sign = contest.rating_change >= 0 ? '+' : '';
        return `[DONE ✅] ${shortName} (${sign}${contest.rating_change})`;
      }
      return `[DONE ✅] ${shortName} (Solved: ${contest.solved})`;
    case 'missed':
      return `[MISSED ❌] ${shortName}`;
    case 'deleted':
      return `[DELETED] ${shortName}`;
    default:
      return shortName;
  }
}

/**
 * Builds the task description with human content and structured metadata.
 */
function buildTaskDescription(contest) {
  const durationStr = formatDuration(contest.end_time - contest.start_time);
  const startStr = formatInTimezone(contest.start_time, 'full');
  const startShortTime = formatInTimezone(contest.start_time, 'short-time');

  let humanNotes = `Starts: ${startShortTime} (${startStr})
Duration: ${durationStr}
Contest ID: ${contest.contest_id}

Contest Link:
https://codeforces.com/contest/${contest.contest_id}`;

  if (contest.status === 'attempted' || contest.status === 'partial' || contest.status === 'archived') {
    const sign = contest.rating_change !== null && contest.rating_change >= 0 ? '+' : '';
    const ratingStr = contest.rating_change !== null ? `${sign}${contest.rating_change}` : 'Pending';
    const rankStr = contest.rank !== null ? String(contest.rank) : 'Pending';

    const solvedProblemsStr = contest.solved_list ? `${contest.solved} (${contest.solved_list})` : String(contest.solved);
    const wrongStr = contest.wrong_submissions;

    humanNotes += `

Solved Problems   : ${solvedProblemsStr}
Wrong Submissions : ${wrongStr}`;

    if (contest.unsolved_list) {
      humanNotes += `
Unsolved Attempts : ${contest.unsolved_list}`;
    }

    humanNotes += `
Standings Rank    : ${rankStr}
Rating Change     : ${ratingStr}`;
  }

  return gt.formatTaskNotes(humanNotes, null);
}

function isGoogleTaskNotFoundError(error) {
  if (!error) return false;
  const msg = String(error.message || error);
  return msg.includes('404') || msg.includes('410') || msg.includes('notFound') || msg.includes('deleted');
}
