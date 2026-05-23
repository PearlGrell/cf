import { Cron } from 'croner';
import { syncUpcomingContests, syncLiveContests, syncCleanupAndArchival } from '../agents/contestAgent.js';
import { logger } from '../utils/logger.js';

let cronJobs = [];

/**
 * Initializes and starts the background daemon cron schedules for self-hosted execution.
 */
export function startScheduler() {
  logger.info('Initializing background scheduler daemon...');

  const upcomingJob = Cron('*/15 * * * *', async () => {
    logger.info('Daemon cron trigger: Upcoming contest synchronization.');
    try {
      await syncUpcomingContests();
    } catch (err) {
      logger.error('Error in upcoming contest sync cron:', err);
    }
  });

  const liveJob = Cron('*/5 * * * *', async () => {
    logger.info('Daemon cron trigger: Live contest state monitoring.');
    try {
      await syncLiveContests();
    } catch (err) {
      logger.error('Error in live contest monitor cron:', err);
    }
  });

  const cleanupJob = Cron('*/30 * * * *', async () => {
    logger.info('Daemon cron trigger: Cleanup and archival processing.');
    try {
      await syncCleanupAndArchival();
    } catch (err) {
      logger.error('Error in cleanup and archival cron:', err);
    }
  });

  cronJobs.push(upcomingJob, liveJob, cleanupJob);
  logger.info('Background scheduler daemon successfully started with 3 cron channels.');
}

/**
 * Stops all running scheduler cron channels gracefully.
 */
export function stopScheduler() {
  logger.info('Stopping background scheduler daemon...');
  for (const job of cronJobs) {
    job.stop();
  }
  cronJobs = [];
  logger.info('Scheduler daemon successfully stopped.');
}
