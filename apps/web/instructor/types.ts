import type { JoinAddress, JudgeSettings, Mark, Question, VideoInfo } from '@scoring-test/shared';

export interface Info {
  session: string;
  appVersion: string;
  addresses: JoinAddress[];
  videos: VideoInfo[];
  settings: JudgeSettings;
  current: Question | null;
  group: number;
}

/** Saved marks for one clip, plus its length once any screen has read it. */
export interface MarksEntry { duration: number | null; marks: Mark[] }
