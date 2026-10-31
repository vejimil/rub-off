// What the browser gets back from a photo run (the server's PhotoRun without the pattern), and
// the golden runs that sample mode replays.

import type { PhotoRun } from "../photo/run.ts";

export type OkRun = Omit<Extract<PhotoRun, { ok: true }>, "pattern">;
export type FailedRun = Extract<PhotoRun, { ok: false }>;

export interface PhotoView {
  src: string;
  width: number;
  height: number;
}

export interface SampleRun {
  photo: PhotoView;
  run: OkRun;
}
