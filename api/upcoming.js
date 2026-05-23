import { syncUpcomingContests } from '../src/agents/contestAgent.js';
import { runMigrations } from '../src/repositories/database.js';
import { logger } from '../src/utils/logger.js';

export default async function handler(req, res) {
  logger.info('API Route Trigger: sync-upcoming');
  try {
    await runMigrations();
    await syncUpcomingContests();
    res.status(200).json({ 
      status: 'SUCCESS', 
      message: 'Upcoming contests fetched and synced successfully.' 
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`API sync-upcoming failed: ${msg}`);
    res.status(500).json({ 
      status: 'FAILED', 
      message: msg 
    });
  }
}
