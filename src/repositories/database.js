import { createClient } from '@libsql/client';
import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';

let dbClient = null;

export function getDbClient() {
  if (!dbClient) {
    logger.debug(`Initializing database client with URL: ${settings.DATABASE_URL}`);
    dbClient = createClient({
      url: settings.DATABASE_URL,
      authToken: settings.DATABASE_AUTH_TOKEN || undefined
    });
  }
  return dbClient;
}

/**
 * Runs DB migrations to set up required SQLite tables.
 */
export async function runMigrations() {
  const db = getDbClient();
  try {
    logger.info('Running database migrations...');
    
    // Create contests table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS contests (
        contest_id INTEGER PRIMARY KEY,
        contest_name TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        status TEXT NOT NULL,
        task_id TEXT,
        attempted INTEGER DEFAULT 0,
        solved INTEGER DEFAULT 0,
        wrong_submissions INTEGER DEFAULT 0,
        rank INTEGER,
        rating_change INTEGER,
        last_synced INTEGER NOT NULL,
        calendar_event_id TEXT,
        solved_list TEXT,
        unsolved_list TEXT
      );
    `);
    
    // Safely add calendar_event_id column if it doesn't exist
    const tableInfo = await db.execute('PRAGMA table_info(contests);');
    const hasCalCol = tableInfo.rows.some(row => row.name === 'calendar_event_id');
    if (!hasCalCol) {
      logger.info('Migrating database: Adding calendar_event_id column to contests table...');
      await db.execute('ALTER TABLE contests ADD COLUMN calendar_event_id TEXT;');
    }

    // Safely add solved_list and unsolved_list columns if they don't exist
    const hasSolvedListCol = tableInfo.rows.some(row => row.name === 'solved_list');
    if (!hasSolvedListCol) {
      logger.info('Migrating database: Adding solved_list and unsolved_list columns to contests table...');
      await db.execute('ALTER TABLE contests ADD COLUMN solved_list TEXT;');
      await db.execute('ALTER TABLE contests ADD COLUMN unsolved_list TEXT;');
    }
    
    // Create sync logs table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        sync_type TEXT NOT NULL,
        status TEXT NOT NULL,
        details TEXT
      );
    `);
    
    logger.info('Database migrations completed successfully.');
  } catch (error) {
    logger.error('Failed to run database migrations:', error);
    throw error;
  }
}

/**
 * Retrieves a single contest by its Codeforces ID.
 */
export async function getContest(contestId) {
  const db = getDbClient();
  try {
    const res = await db.execute({
      sql: 'SELECT * FROM contests WHERE contest_id = ?',
      args: [contestId]
    });
    
    if (res.rows.length === 0) return null;
    
    const row = res.rows[0];
    return {
      contest_id: Number(row.contest_id),
      contest_name: String(row.contest_name),
      start_time: Number(row.start_time),
      end_time: Number(row.end_time),
      status: row.status,
      task_id: row.task_id ? String(row.task_id) : null,
      attempted: Number(row.attempted),
      solved: Number(row.solved),
      wrong_submissions: Number(row.wrong_submissions),
      rank: row.rank !== null && row.rank !== undefined ? Number(row.rank) : null,
      rating_change: row.rating_change !== null && row.rating_change !== undefined ? Number(row.rating_change) : null,
      last_synced: Number(row.last_synced),
      calendar_event_id: row.calendar_event_id ? String(row.calendar_event_id) : null,
      solved_list: row.solved_list ? String(row.solved_list) : null,
      unsolved_list: row.unsolved_list ? String(row.unsolved_list) : null
    };
  } catch (error) {
    logger.error(`Error fetching contest ID ${contestId}:`, error);
    throw error;
  }
}

/**
 * Inserts or updates a contest record in the database.
 */
export async function upsertContest(contest) {
  const db = getDbClient();
  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO contests (
              contest_id, contest_name, start_time, end_time, status, task_id, 
              attempted, solved, wrong_submissions, rank, rating_change, last_synced,
              calendar_event_id, solved_list, unsolved_list
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        contest.contest_id,
        contest.contest_name,
        contest.start_time,
        contest.end_time,
        contest.status,
        contest.task_id,
        contest.attempted,
        contest.solved,
        contest.wrong_submissions,
        contest.rank,
        contest.rating_change,
        contest.last_synced,
        contest.calendar_event_id || null,
        contest.solved_list || null,
        contest.unsolved_list || null
      ]
    });
    logger.debug(`Database upserted contest ${contest.contest_id} (${contest.status})`);
  } catch (error) {
    logger.error(`Error saving contest ID ${contest.contest_id}:`, error);
    throw error;
  }
}

/**
 * Gets active contests (currently scheduled or live) to monitor.
 */
export async function getActiveContests() {
  return getContestsByStatus(['scheduled', 'live']);
}

/**
 * Gets contests filtering by a list of statuses.
 */
export async function getContestsByStatus(statuses) {
  const db = getDbClient();
  if (statuses.length === 0) return [];
  
  try {
    const placeholders = statuses.map(() => '?').join(',');
    const res = await db.execute({
      sql: `SELECT * FROM contests WHERE status IN (${placeholders}) ORDER BY start_time ASC`,
      args: statuses
    });
    
    return res.rows.map(row => ({
      contest_id: Number(row.contest_id),
      contest_name: String(row.contest_name),
      start_time: Number(row.start_time),
      end_time: Number(row.end_time),
      status: row.status,
      task_id: row.task_id ? String(row.task_id) : null,
      attempted: Number(row.attempted),
      solved: Number(row.solved),
      wrong_submissions: Number(row.wrong_submissions),
      rank: row.rank !== null && row.rank !== undefined ? Number(row.rank) : null,
      rating_change: row.rating_change !== null && row.rating_change !== undefined ? Number(row.rating_change) : null,
      last_synced: Number(row.last_synced),
      calendar_event_id: row.calendar_event_id ? String(row.calendar_event_id) : null,
      solved_list: row.solved_list ? String(row.solved_list) : null,
      unsolved_list: row.unsolved_list ? String(row.unsolved_list) : null
    }));
  } catch (error) {
    logger.error(`Error fetching contests by status (${statuses.join(', ')}):`, error);
    throw error;
  }
}

/**
 * Records a scheduler synchronisation operation log.
 */
export async function logSync(syncType, status, details) {
  const db = getDbClient();
  try {
    await db.execute({
      sql: `INSERT INTO sync_logs (timestamp, sync_type, status, details) VALUES (?, ?, ?, ?)`,
      args: [Math.floor(Date.now() / 1000), syncType, status, details]
    });
  } catch (error) {
    logger.error(`Error creating sync log for ${syncType}:`, error);
  }
}

/**
 * Gets contests that are ended, marked as 'missed', and older than retention duration.
 */
export async function getMissedContestsToDelete(retentionDays) {
  const db = getDbClient();
  const thresholdTime = Math.floor(Date.now() / 1000) - (retentionDays * 24 * 60 * 60);
  try {
    const res = await db.execute({
      sql: `SELECT * FROM contests WHERE status = 'missed' AND end_time <= ?`,
      args: [thresholdTime]
    });
    
    return res.rows.map(row => ({
      contest_id: Number(row.contest_id),
      contest_name: String(row.contest_name),
      start_time: Number(row.start_time),
      end_time: Number(row.end_time),
      status: row.status,
      task_id: row.task_id ? String(row.task_id) : null,
      attempted: Number(row.attempted),
      solved: Number(row.solved),
      wrong_submissions: Number(row.wrong_submissions),
      rank: row.rank !== null && row.rank !== undefined ? Number(row.rank) : null,
      rating_change: row.rating_change !== null && row.rating_change !== undefined ? Number(row.rating_change) : null,
      last_synced: Number(row.last_synced),
      calendar_event_id: row.calendar_event_id ? String(row.calendar_event_id) : null,
      solved_list: row.solved_list ? String(row.solved_list) : null,
      unsolved_list: row.unsolved_list ? String(row.unsolved_list) : null
    }));
  } catch (error) {
    logger.error('Error fetching missed contests for cleanup:', error);
    throw error;
  }
}
