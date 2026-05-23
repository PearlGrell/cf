import { google } from 'googleapis';
import { getOAuth2Client } from './googleAuth.js';
import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';

let resolvedTaskListId = null;

/**
 * Returns an authenticated Google Tasks API client.
 */
export async function getGoogleTasksClient() {
  const auth = await getOAuth2Client();
  return google.tasks({ version: 'v1', auth });
}

/**
 * Resolves the Google Task List ID based on configuration.
 */
export async function getTaskListId() {
  if (resolvedTaskListId) return resolvedTaskListId;

  const targetList = settings.GOOGLE_TASKLIST_ID;
  if (targetList === '@default') {
    resolvedTaskListId = '@default';
    return '@default';
  }

  const tasksClient = await getGoogleTasksClient();
  try {
    logger.debug(`Resolving task list for target name: "${targetList}"`);
    const listRes = await tasksClient.tasklists.list({ maxResults: 100 });
    const lists = listRes.data.items || [];
    
    const matchedById = lists.find(list => list.id === targetList);
    if (matchedById) {
      resolvedTaskListId = matchedById.id;
      logger.info(`Resolved task list by exact ID: "${targetList}"`);
      return resolvedTaskListId;
    }

    const matchedByTitle = lists.find(list => list.title?.toLowerCase() === targetList.toLowerCase());
    if (matchedByTitle) {
      resolvedTaskListId = matchedByTitle.id;
      logger.info(`Resolved task list by matching title: "${matchedByTitle.title}" (${resolvedTaskListId})`);
      return resolvedTaskListId;
    }

    logger.info(`Task list named "${targetList}" not found. Auto-creating a new Google Task List...`);
    const createRes = await tasksClient.tasklists.insert({
      requestBody: { title: targetList }
    });
    resolvedTaskListId = createRes.data.id;
    logger.info(`Successfully created custom Google Task List: "${targetList}" (ID: ${resolvedTaskListId})`);
    return resolvedTaskListId;
  } catch (error) {
    logger.error('Failed to resolve Google Task List ID. Defaulting to @default. Error:', error);
    resolvedTaskListId = '@default';
    return '@default';
  }
}

/**
 * Creates a Google Task and returns its ID.
 */
export async function createTask(title, notes, due) {
  const client = await getGoogleTasksClient();
  const listId = await getTaskListId();
  try {
    const res = await client.tasks.insert({
      tasklist: listId,
      requestBody: {
        title,
        notes,
        due,
        status: 'needsAction'
      }
    });
    const taskId = res.data.id;
    logger.info(`Created Google Task: "${title}" (ID: ${taskId}, Due: ${due})`);
    return taskId;
  } catch (error) {
    logger.error(`Failed to create Google Task "${title}":`, error);
    throw error;
  }
}

/**
 * Updates a Google Task title and notes.
 */
export async function updateTask(taskId, title, notes, due) {
  const client = await getGoogleTasksClient();
  const listId = await getTaskListId();
  try {
    await client.tasks.patch({
      tasklist: listId,
      task: taskId,
      requestBody: {
        title,
        notes,
        due
      }
    });
    logger.info(`Updated Google Task ID: ${taskId} (Title: "${title}", Due: ${due})`);
  } catch (error) {
    logger.error(`Failed to update Google Task ID ${taskId}:`, error);
    throw error;
  }
}

/**
 * Deletes a Google Task.
 */
export async function deleteTask(taskId) {
  const client = await getGoogleTasksClient();
  const listId = await getTaskListId();
  try {
    await client.tasks.delete({
      tasklist: listId,
      task: taskId
    });
    logger.info(`Deleted Google Task ID: ${taskId}`);
  } catch (error) {
    logger.error(`Failed to delete Google Task ID ${taskId}:`, error);
    throw error;
  }
}

/**
 * Formats task notes containing a human-readable summary and structured AGENT_METADATA.
 */
export function formatTaskNotes(humanContent, metadata) {
  return humanContent;
}

/**
 * Parses the structured AGENT_METADATA JSON block from task notes.
 */
export function parseTaskMetadata(notes) {
  if (!notes) return null;
  
  const startDelimiter = 'AGENT_METADATA';
  const startIndex = notes.indexOf(startDelimiter);
  if (startIndex === -1) return null;

  try {
    const metadataSub = notes.substring(startIndex + startDelimiter.length).trim();
    const firstBrace = metadataSub.indexOf('{');
    const lastBrace = metadataSub.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) return null;

    const jsonString = metadataSub.substring(firstBrace, lastBrace + 1);
    return JSON.parse(jsonString);
  } catch (err) {
    logger.warn('Failed to parse AGENT_METADATA JSON block from task notes:', err);
    return null;
  }
}
