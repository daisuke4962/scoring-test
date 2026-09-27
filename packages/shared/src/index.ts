// Shared between the instructor server and the web clients: the wire protocol and judging.
import type { JudgeResult, JudgeSettings, Mark, Question } from './judge.ts';

export const PROTOCOL_VERSION = 5;

export * from './judge.ts';

export type Side = 'chung' | 'hong';
export type TapValue = 1 | 2 | 3 | 'gj' | 'undo';

export interface TraineeInfo {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;          // tapped "Ready" (unlocks media playback on iOS)
  loadedVideo: string | null;
}

export interface TapRecord {
  traineeId: string;
  name: string;
  questionId: string;
  videoId: string;
  side: Side;
  value: TapValue;
  videoTime: number;       // seconds into the clip, read from the phone's own player
  wallTime: number;        // phone's Date.now(), informational only
}

export interface VideoInfo {
  id: string;
  url: string;             // path on this server, e.g. /videos/abc.mp4
  name: string;
  size: number;
}

/** One address phones could use to reach this server. */
export interface JoinAddress {
  url: string;             // full join URL including the session code
  label: string;           // network interface name, e.g. "Wi-Fi"
  address: string;         // the IPv4 address itself
  qr: string;              // data: URL of the QR code for `url`
  primary: boolean;        // the interface the OS would actually route through
}

/** What a phone is told about a question: where to play it. Never the answers. */
export interface QuestionCue { id: string; start: number; end: number }

/** One phone's result for one question, sent once that phone has finished it. */
export interface ResultMessage {
  type: 'result';
  questionId: string;
  traineeId: string;
  name: string;
  marks: Mark[];           // revealed only now, so the phone can show what it missed
  result: JudgeResult;
}

/** How one trainee did, as kept in the session record. The marks live on the attempt instead. */
export interface TraineeResult {
  traineeId: string;
  name: string;
  result: JudgeResult;
}

/**
 * One play of one question: what was asked, and how everyone did. Pressing Play again on the same
 * question starts another attempt, so nothing is written over. The question is copied in as it was
 * sent, so editing its marks afterwards never changes a record.
 */
export interface Attempt {
  id: string;
  question: Question;
  round: number;           // 1 for the first play of this question, 2 for the next, and so on
  group: number;           // which group of trainees was at the phones
  at: number;              // Date.now() when it was played
  results: TraineeResult[];
}

/** Messages a client sends to the server. */
export type ClientMessage =
  | { type: 'hello'; role: 'instructor'; version: number }
  | { type: 'hello'; role: 'trainee'; version: number; name: string; session: string; traineeId?: string }
  | { type: 'ready' }
  | { type: 'loaded'; videoId: string }
  | { type: 'loadError'; videoId: string; message: string }
  | { type: 'tap'; questionId: string; side: Side; value: TapValue; videoTime: number; wallTime: number }
  | { type: 'ended'; questionId: string }
  // instructor only
  | { type: 'getMarks'; videoId: string }
  | { type: 'saveMarks'; videoId: string; duration: number | null; marks: Mark[] }
  | { type: 'saveSettings'; settings: JudgeSettings }
  | { type: 'load'; question: Question }
  | { type: 'play'; questionId: string }
  | { type: 'stop' }
  | { type: 'nextGroup' };

/** Problems the server reports. Clients turn the code into text in the viewer's language. */
export type ErrorCode = 'version' | 'session' | 'loadError';

/** Messages the server sends to clients. */
export type ServerMessage =
  | { type: 'welcome'; traineeId: string; session: string }
  | { type: 'error'; code: ErrorCode; name?: string }
  | { type: 'load'; video: VideoInfo; question: QuestionCue; tolerance: number }
  | { type: 'play'; questionId: string }
  | { type: 'stop' }
  | { type: 'released' }     // this group is done; the phone goes back to the join screen
  | ResultMessage
  // instructor only
  | { type: 'info'; session: string; appVersion: string; addresses: JoinAddress[]; videos: VideoInfo[]; settings: JudgeSettings; current: Question | null; group: number }
  | { type: 'marks'; videoId: string; duration: number | null; marks: Mark[] }
  | { type: 'trainees'; list: TraineeInfo[] }
  | { type: 'tap'; tap: TapRecord }
  | { type: 'ended'; traineeId: string; questionId: string }
  | { type: 'attempts'; list: Attempt[] }     // the session so far, on connecting
  | { type: 'attempt'; attempt: Attempt };    // one play, just started or just updated
