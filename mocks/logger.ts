import type { ILogger, LogLevel } from "../src/Membrane";

export namespace loggerLib {
  class BasicLogger implements ILogger {
    log(level: LogLevel, message: unknown) {
      var exn = null,
        exnFound = false;
      this.appenders.forEach(function (appender) {
        try {
          appender.notify(level, message);
        } catch (e) {
          if (!exnFound) {
            exnFound = true;
            exn = e;
          }
        }
      });
      if (exnFound) {
        throw exn;
      }
    }

    fatal = (message: unknown): void => {
      this.log("FATAL", message);
    };

    error = (message: unknown): void => {
      this.log("ERROR", message);
    };

    warn = (message: unknown): void => {
      this.log("WARN", message);
    };

    info = (message: unknown): void => {
      this.log("INFO", message);
    };

    debug = (message: unknown): void => {
      this.log("DEBUG", message);
    };

    trace = (message: unknown): void => {
      this.log("TRACE", message);
    };

    public appenders: Appender[] = [];

    public levels!: LogLevel[];

    addAppender(appender: Appender): void {
      this.appenders.push(appender);
    }

    removeAppender(appender: Appender): void {
      let index = this.appenders.indexOf(appender);
      if (index != -1) {
        this.appenders.splice(index, 1);
      }
    }
  }

  BasicLogger.prototype.levels = ["FATAL", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"];

  export class Appender {
    threshold: LogLevel = "TRACE";
    events: Array<{ level: any; message: unknown }> = [];
    clear() {
      this.events = [];
    }
    notify(level: LogLevel, message: unknown) {
      if (
        BasicLogger.prototype.levels.indexOf(level) <=
        BasicLogger.prototype.levels.indexOf(this.threshold)
      ) {
        this.events.push({ level, message });
      }
    }
    setThreshold(level: LogLevel) {
      if (BasicLogger.prototype.levels.includes(level)) {
        this.threshold = level;
      }
    }
  }

  const loggerMap = new Map<string, BasicLogger>();

  export function getLogger(name: string): BasicLogger {
    if (!loggerMap.has(name)) {
      loggerMap.set(name, new BasicLogger());
    }
    return loggerMap.get(name)!;
  }
}
