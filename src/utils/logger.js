import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { settings } from '../config/settings.js';

const logFormat = winston.format.printf(({ timestamp, level, message, ...metadata }) => {
  let msg = `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  logFormat
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const configuredLevel = settings.LOG_LEVEL.toLowerCase();
const levels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
const level = levels.includes(configuredLevel) ? configuredLevel : 'info';

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: level
  })
];

if (!process.env.VERCEL) {
  const logDir = path.resolve('logs');
  
  transports.push(
    new DailyRotateFile({
      dirname: logDir,
      filename: 'cf-agent-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '5m',
      maxFiles: '14d',
      format: fileFormat,
      level: level
    })
  );
}

export const logger = winston.createLogger({
  level: level,
  transports: transports
});
