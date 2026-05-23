import { syncCleanupAndArchival } from '../src/agents/contestAgent.js';
import { runMigrations } from '../src/repositories/database.js';
import { logger } from '../src/utils/logger.js';

export default async function handler(req, res) {
  logger.info('API Route Trigger: sync-cleanup');
  try {
    await runMigrations();
    await syncCleanupAndArchival();
    res.status(200).json({ 
      status: 'SUCCESS', 
      message: 'Ended contests evaluated, rating metrics retrieved, and retention cleanup finalized successfully.' 
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`API sync-cleanup failed: ${msg}`);
    res.status(500).json({ 
      status: 'FAILED', 
      message: msg 
    });
  }
}
