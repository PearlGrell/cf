import { google } from 'googleapis';
import fs from 'fs/promises';
import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';

let oauth2Client = null;

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the unified authenticated OAuth2 client.
 */
export async function getOAuth2Client() {
  if (oauth2Client) {
    return oauth2Client;
  }

  let creds;
  if (settings.GOOGLE_CREDENTIALS_JSON) {
    logger.info('Loading Google OAuth credentials from environment variable GOOGLE_CREDENTIALS_JSON');
    try {
      creds = JSON.parse(settings.GOOGLE_CREDENTIALS_JSON);
    } catch (err) {
      logger.error('Failed to parse GOOGLE_CREDENTIALS_JSON environment variable.');
      throw err;
    }
  } else {
    try {
      if (await fileExists(settings.GOOGLE_CREDENTIALS_PATH)) {
        const fileContent = await fs.readFile(settings.GOOGLE_CREDENTIALS_PATH, 'utf-8');
        creds = JSON.parse(fileContent);
      } else {
        throw new Error(`Google credentials file not found at ${settings.GOOGLE_CREDENTIALS_PATH}. Please run "npm run oauth" or set GOOGLE_CREDENTIALS_JSON.`);
      }
    } catch (err) {
      logger.error(`Failed to load Google client credentials: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  const clientInfo = creds.installed || creds.web;
  if (!clientInfo) {
    throw new Error('Malformed credentials.json. Ensure it contains an "installed" or "web" block.');
  }

  const { client_secret, client_id, redirect_uris } = clientInfo;
  oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris ? redirect_uris[0] : 'http://localhost'
  );

  let tokenData = null;

  if (settings.GOOGLE_OAUTH_TOKEN_JSON) {
    logger.info('Loading Google OAuth token from environment variable GOOGLE_OAUTH_TOKEN_JSON');
    try {
      tokenData = JSON.parse(settings.GOOGLE_OAUTH_TOKEN_JSON);
    } catch (err) {
      logger.error('Failed to parse GOOGLE_OAUTH_TOKEN_JSON environment variable.');
      throw err;
    }
  } else {
    try {
      if (await fileExists(settings.GOOGLE_TOKEN_PATH)) {
        const fileContent = await fs.readFile(settings.GOOGLE_TOKEN_PATH, 'utf-8');
        tokenData = JSON.parse(fileContent);
      } else {
        throw new Error(`OAuth token file not found at ${settings.GOOGLE_TOKEN_PATH}. Please run "npm run oauth" to initialize first.`);
      }
    } catch (err) {
      logger.error(`Failed to load Google OAuth token: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  oauth2Client.setCredentials(tokenData);

  oauth2Client.on('tokens', async (tokens) => {
    logger.info('Google OAuth access token refreshed.');
    tokenData.access_token = tokens.access_token;
    if (tokens.refresh_token) {
      tokenData.refresh_token = tokens.refresh_token;
    }
    if (tokens.expiry_date) {
      tokenData.expiry_date = tokens.expiry_date;
    }

    oauth2Client.setCredentials(tokenData);

    if (!settings.GOOGLE_OAUTH_TOKEN_JSON && !process.env.VERCEL) {
      try {
        await fs.mkdir('data', { recursive: true });
        await fs.writeFile(settings.GOOGLE_TOKEN_PATH, JSON.stringify(tokenData, null, 2));
        logger.info(`Successfully stored refreshed OAuth token back to ${settings.GOOGLE_TOKEN_PATH}`);
      } catch (err) {
        logger.error('Failed to save refreshed token to disk:', err);
      }
    }
  });

  return oauth2Client;
}
