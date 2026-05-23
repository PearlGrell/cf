import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const settings = {
  CF_HANDLE: process.env.CF_HANDLE || '',
  DATABASE_URL: process.env.DATABASE_URL || 'file:data/cf_agent.db',
  DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || '',
  GOOGLE_TASKLIST_ID: process.env.GOOGLE_TASKLIST_ID || '@default',
  GOOGLE_CREDENTIALS_PATH: process.env.GOOGLE_CREDENTIALS_PATH || 'data/credentials.json',
  GOOGLE_CREDENTIALS_JSON: process.env.GOOGLE_CREDENTIALS_JSON || '',
  GOOGLE_TOKEN_PATH: process.env.GOOGLE_TOKEN_PATH || 'data/token.json',
  GOOGLE_OAUTH_TOKEN_JSON: process.env.GOOGLE_OAUTH_TOKEN_JSON || '',
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  DELETE_UNATTEMPTED: process.env.DELETE_UNATTEMPTED !== 'false', // Defaults to true
  MISSED_RETENTION_DAYS: parseInt(process.env.MISSED_RETENTION_DAYS || '3', 10),
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  LOG_LEVEL: process.env.LOG_LEVEL || 'INFO',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || ''
};
