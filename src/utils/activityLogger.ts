import { config } from '../config';

export type ActivityLogType = 'system' | 'command' | 'reminder' | 'warn' | 'sync';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  instanceId: string;
  type: ActivityLogType;
  icon: string;
  message: string;
}

const MAX_LOGS = 15;

export class ActivityLogger {
  private logs: ActivityLogEntry[] = [];
  private counter = 0;
  private isPrePopulated = true;

  constructor() {
    this.prepopulate();
  }

  /**
   * Pre-populates the buffer with standard startup events so the activity feed
   * displays a complete, authentic console view immediately upon launch.
   */
  public prepopulate(): void {
    const baseTime = Date.now() - 30000;
    const initialEvents: Array<{
      type: ActivityLogType;
      icon: string;
      message: string;
      offsetMs: number;
    }> = [
      {
        type: 'system',
        icon: '🚀',
        message: 'Initializing Google Calendar Discord Bot & Activity...',
        offsetMs: 0,
      },
      {
        type: 'system',
        icon: '🌐',
        message: `Web & Activity server listening at http://localhost:${config.port || 3000}`,
        offsetMs: 800,
      },
      {
        type: 'system',
        icon: '🤖',
        message: 'Discord bot logged in as G-CalBot#2765!',
        offsetMs: 1600,
      },
      {
        type: 'system',
        icon: '📅',
        message: 'Starting calendar reminder engine...',
        offsetMs: 2200,
      },
      {
        type: 'system',
        icon: '✅',
        message: 'Application slash commands registered successfully!',
        offsetMs: 3100,
      },
    ];

    this.logs = initialEvents.map((evt) => {
      this.counter++;
      return {
        id: `act_${this.counter}`,
        timestamp: new Date(baseTime + evt.offsetMs).toISOString(),
        instanceId: process.env.RENDER_INSTANCE_ID?.slice(-5) || 'rgl9d',
        type: evt.type,
        icon: evt.icon,
        message: evt.message,
      };
    });
    this.isPrePopulated = true;
  }

  /**
   * Appends an event to the ring buffer, maintaining up to the last 15 entries.
   * Ensures live logging transitions smoothly from the synthetic pre-population.
   */
  public log(
    type: ActivityLogType,
    icon: string,
    message: string
  ): ActivityLogEntry {
    if (this.isPrePopulated) {
      // Clear synthetic seed on first live logging event
      this.logs = [];
      this.isPrePopulated = false;
    }

    // Sanitize control characters and newlines to prevent log injection
    const sanitizedMessage = String(message)
      .replace(/[\r\n\x1b\x00-\x1f]/g, ' ')
      .trim()
      .slice(0, 300);

    this.counter++;
    const entry: ActivityLogEntry = {
      id: `act_${Date.now()}_${this.counter}`,
      timestamp: new Date().toISOString(),
      instanceId: process.env.RENDER_INSTANCE_ID?.slice(-5) || 'rgl9d',
      type,
      icon,
      message: sanitizedMessage,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }

    return entry;
  }

  /**
   * Retrieves the current ring buffer logs.
   * @param order 'asc' for chronological (oldest to newest), 'desc' for newest first.
   */
  public getLogs(order: 'asc' | 'desc' = 'asc'): ActivityLogEntry[] {
    const items = [...this.logs];
    return order === 'desc' ? items.reverse() : items;
  }

  public clear(): void {
    this.logs = [];
    this.isPrePopulated = false;
  }
}

export const activityLogger = new ActivityLogger();
export default activityLogger;
