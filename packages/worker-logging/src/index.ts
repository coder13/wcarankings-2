import { basename, dirname } from "node:path";
import winston, { type Logger } from "winston";

const MAX_LOG_BYTES = 128 * 1024 * 1024;

type WorkerLoggerOptions = {
  filePath?: string;
  name: string;
};

export type WorkerLogger = Logger;

export function createWorkerLogger({
  name,
  filePath = `logs/${name}.log`,
}: WorkerLoggerOptions): Logger {
  return winston.createLogger({
    level: "debug",
    defaultMeta: { worker: name },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        level: "info",
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: "HH:mm:ss" }),
          winston.format.printf(
            ({ level, message, timestamp }) =>
              `${timestamp} ${level}: ${message}`,
          ),
        ),
      }),
      new winston.transports.File({
        dirname: dirname(filePath),
        filename: basename(filePath),
        level: "debug",
        maxsize: MAX_LOG_BYTES,
        maxFiles: 1,
        tailable: true,
      }),
    ],
  });
}

export function closeWorkerLogger(logger: Logger): Promise<void> {
  return new Promise((resolve) => {
    logger.once("finish", resolve);
    logger.end();
  });
}
