import { runMigrations } from '../src/repositories/database.js';
import { syncUpcomingContests, syncLiveContests, syncCleanupAndArchival } from '../src/agents/contestAgent.js';
import { logger } from '../src/utils/logger.js';

export default async function handler(req, res) {
  logger.info('API Route Trigger: Consolidated sync-all');
  try {
    await runMigrations();
    
    logger.info('Running syncUpcomingContests()...');
    await syncUpcomingContests();
    
    logger.info('Running syncLiveContests()...');
    await syncLiveContests();
    
    logger.info('Running syncCleanupAndArchival()...');
    await syncCleanupAndArchival();
    
    res.status(200).json({
      status: 'SUCCESS',
      message: 'All synchronization phases completed successfully.'
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`API sync-all failed: ${msg}`);
    res.status(500).json({
      status: 'FAILED',
      message: msg
    });
  }
}
