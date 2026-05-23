import { syncLiveContests } from '../src/agents/contestAgent.js';
import { runMigrations } from '../src/repositories/database.js';
import { logger } from '../src/utils/logger.js';

export default async function handler(req, res) {
  logger.info('API Route Trigger: sync-live');
  try {
    await runMigrations();
    await syncLiveContests();
    res.status(200).json({ 
      status: 'SUCCESS', 
      message: 'Live contests evaluated and updated successfully.' 
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`API sync-live failed: ${msg}`);
    res.status(500).json({ 
      status: 'FAILED', 
      message: msg 
    });
  }
}
