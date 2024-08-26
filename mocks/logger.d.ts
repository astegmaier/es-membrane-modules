import type { WithThisValueForMethods } from "../src/utilityTypes";
import type { ILogger, LogLevel } from "../src/Membrane";

export interface IAppender {
  clear(): void;
  notify(level: LogLevel, message: any): void;
  setThreshold(level: LogLevel): void;
}

export interface IBasicAppenderPrototype
  extends WithThisValueForMethods<IAppender, IBasicAppender> {}

export interface IBasicAppender extends IBasicAppenderPrototype {
  events: Array<{ level: any; message: any }>;
  threshold: LogLevel;
}

export interface IBasicLoggerPrototype {
  log(
    this: IBasicLogger,
    level: LogLevel,
    message: string,
    codeLocation?: string,
    error?: unknown
  ): void;
  levels: LogLevel[];
  addAppender(appender: IAppender): void;
  removeAppender(appender: IAppender): void;
}

export interface IBasicLogger extends IBasicLoggerPrototype, ILogger {
  appenders: IAppender[];
}

export declare module loggerLib {
  interface BasicAppender extends IBasicAppender {}
  class BasicAppender {}
  function getLogger(name: string): IBasicLogger;
  const Appender: BasicAppender;
}
