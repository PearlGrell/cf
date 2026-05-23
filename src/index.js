import express from 'express';
import { runMigrations } from './repositories/database.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { settings } from './config/settings.js';
import { logger } from './utils/logger.js';
import { syncUpcomingContests, syncLiveContests, syncCleanupAndArchival } from './agents/contestAgent.js';

import upcomingHandler from '../api/upcoming.js';
import liveHandler from '../api/live.js';
import cleanupHandler from '../api/cleanup.js';

/**
 * Executes a one-off synchronization run from CLI arguments.
 */
async function runCliMode(syncType) {
  logger.info(`Running in CLI one-off mode for sync type: "${syncType}"`);
  try {
    await runMigrations();
    
    switch (syncType.toLowerCase()) {
      case 'upcoming':
        await syncUpcomingContests();
        break;
      case 'live':
        await syncLiveContests();
        break;
      case 'cleanup':
        await syncCleanupAndArchival();
        break;
      default:
        logger.error(`Unknown sync type: "${syncType}". Choose 'upcoming', 'live', or 'cleanup'.`);
        process.exit(1);
    }
    
    logger.info(`CLI sync for "${syncType}" completed successfully.`);
    process.exit(0);
  } catch (err) {
    logger.error(`CLI sync for "${syncType}" failed:`, err);
    process.exit(1);
  }
}

/**
 * Starts the long-running self-hosted daemon service.
 */
async function startDaemon() {
  logger.info('Starting CP Contest Management Agent in DAEMON mode...');
  
  try {
    await runMigrations();
    
    const app = express();
    app.use(express.json());
    
    const startTime = Date.now();
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'UP',
        uptime: `${Math.round((Date.now() - startTime) / 1000)}s`,
        timestamp: Math.floor(Date.now() / 1000),
        handle: settings.CF_HANDLE || 'Not Configured',
        timezone: settings.TIMEZONE
      });
    });
    
    app.get('/api/upcoming', upcomingHandler);
    app.get('/api/live', liveHandler);
    app.get('/api/cleanup', cleanupHandler);
    
    const server = app.listen(settings.PORT, settings.HOST, () => {
      logger.info(`Web server actively listening on http://${settings.HOST}:${settings.PORT}`);
    });
    
    startScheduler();
    
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      stopScheduler();
      
      server.close(() => {
        logger.info('Web server successfully closed.');
        logger.info('Graceful shutdown completed. Exiting.');
        process.exit(0);
      });
      
      setTimeout(() => {
        logger.warn('Forcing exit due to outstanding network connections.');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (err) {
    logger.error('Failed to start daemon:', err);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const syncTypeArgIdx = args.findIndex(arg => arg === '--sync-type');

if (syncTypeArgIdx !== -1 && syncTypeArgIdx + 1 < args.length) {
  const syncTypeValue = args[syncTypeArgIdx + 1];
  runCliMode(syncTypeValue);
} else {
  startDaemon();
}
