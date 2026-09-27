# Scoring Test

Seminar tool for taekwondo kyorugi judges: the instructor's PC sends short match clips to trainees' phones over the seminar router, trainees tap the points as they see them, and the PC records when they tapped relative to the clip.

Successor to Referee Trainer. Requirements: see the Scoring Test requirements document (draft 0.1).

Not a World Taekwondo product and not a measuring instrument. It is for practice: the answers it judges against are the marks the instructor made by hand, and a real match has a real jury. MIT licensed (see `LICENSE`) — take it, change it, use it for your own seminars.

## Using video

The clips are the instructor's own recordings, and choosing which footage to use is the instructor's call: have the right to use it, and make sure the people in it are content to appear. The app says as much on the screen where clips are added.

Clips never leave the room. They are served by the instructor's PC to the phones on the local network, and the app has no connection to any service that could receive them. The only thing it ever fetches from the internet is its own update, and it asks first.

## Status: Phase 1 (questions and judging)

The instructor page has two tabs.

**Make questions.** Play a clip on the PC and press the same buttons the phones have (or the keys shown on them) the moment a point is scored. Each press becomes a mark; pressing 2 or 3 twice quickly makes a turning kick (4 or 6), and Undo takes back the last press on that side. Marks save automatically. The list lets you jump to a mark, move it by a frame, change its value, or remove it. Questions are built from the marks automatically: each runs from a few seconds before its first mark to a few seconds after its last, and marks close together share one question. The clip itself is never cut.

**Run a test.** Pick a question and it waits on the instructor's own screen at its first frame; send it to the phones and press Play, and the same stretch runs there too, stopping where the phones stop. That preview is muted, since the sound is already in the room from the phones; the player's own control turns it up. Each phone plays only that stretch, keeps taking presses for the accepted time after it ends, and then gets its own result. The instructor sees, for every scoring moment, how many trainees got it right, and for every trainee the counts of correct answers, wrong values, wrong sides, misses and extra presses, plus the median delay.

Phones are told where to play but never the answers; the marks reach a phone only with its result.

Both screens carry a **How to use** sheet, in whichever language the screen is set to: the instructor gets making questions, running a test, groups, results and settings; the phone gets the five things a trainee needs and nothing else.

Judging (in `packages/shared/src/judge.ts`, used by the server and later by phones practicing alone):

| Rule | Default |
|---|---|
| A press counts for a mark from this long before it | 0.3 s |
| ...until this long after it | 1.0 s |
| A second 2 or 3 on the same side within this long doubles the first (turning kick) | 1.0 s |
| Two quick 1s | Two punches, never doubled |

All three are adjustable under "Judging" on the Run tab. Pairing presses with marks prefers the exact answer, then the right side with the wrong value, then the wrong side, and takes the closest pairs in time first.

Three more settings, on the Make questions tab, shape the questions rather than the judging: how long the clip runs before the first mark, how much that run-up varies from one question to the next, and how long it keeps running after the last mark. The variation is fixed per question — the same question always opens the same way — but differs between questions, so nobody learns how long to wait. Stretches with no scoring in them are listed as questions too: the only way to practise holding back, and the only way an over-eager judge shows up.

## Groups

Twenty people go through in groups of four or five. **Next group** lets the phones go: each returns to its join screen saying the group is over, ready to hand to the next person, who types a name and taps Join once. That single tap is also the gesture that lets the clip play, so there is no second step to forget. The questions, the marks and the record all stay put; only the people change.

Every play is stamped with its group, and the round count starts again for each group, so "group 3, round 2" reads as it happened. One session holds all four groups.

## The session record

Every press of Play is recorded: the question that went out, with its marks as they stood at that moment, the time, and how each trainee did. Playing the same question again is kept as its own round instead of writing over the first, so nothing is lost by running it twice. The Results card lists every play of the session, so an earlier question can be opened again at any point, and **Save CSV** writes the lot out — a row per trainee per play, carrying the group and round, times with their UTC offset, and a byte order mark so Excel reads names in any script.

The server keeps the same record in `data/sessions/<local time>-<session code>.json` as the session happens, so a closed window or a crash loses nothing. Editing a clip's marks afterwards never changes what a record says, because each play holds its own copy of the question.

The terminal the server runs in keeps a plain record of the session, which is the quickest way to see what a result was based on:

```
sent q-e1 to phones (test-clip.mp4 0.0-12.0 s, 3 marks)
play q-e1
  Dai: finished q-e1
  judged Dai: 2/3 correct, 1 extra, from 4 presses
```

Pressing Play again starts the question over: the presses and results from the previous attempt are dropped, so a replay with nobody pressing reads as 0 correct. A phone that reloads keeps its place in the list but has to tap Ready again before it can play, and the instructor's list shows it as not ready until it does.

Tests: `npm test` (on Windows PowerShell, `npm.cmd test`).

## Phase 0 checks (communication prototype)

What works:
- Instructor page shows a QR code + 4-digit session code; phones on the same Wi-Fi join with a name.
- Instructor uploads a clip, sends it to all phones (they preload it), presses Play.
- Phones play the clip locally and send each tap with the clip time read from their own player.
- Taps appear live on the instructor page.
- A phone that reloads or drops off rejoins automatically as the same person, keeping its row.

Verified in two browser clients against a 12 s / 5 MB test clip:

| Check | Result |
|---|---|
| Tap time relayed to the instructor | Matches the phone's own player to the millisecond |
| Two clients whose playback started ~2.3 s apart | Each tap recorded against its own clip position, so the offset does not matter |
| Reconnect after a page reload | Same trainee id, no duplicate row, no re-entry of the name |
| Windows Firewall / LAN address | Node already allowed; `http://<lan-ip>:8787` answers |

Still to confirm on real hardware: an actual phone over the seminar router, the iOS "local network" permission prompt, and the firewall prompt on a PC that has never run Node.

Question authoring and judging, the session record and CSV, rotating groups, and the installer all arrived after that (above). Still to come: converting a clip on import, if a phone ever refuses one.

Testing note: two browser tabs on one machine share `localStorage`, so the second tab's name overwrites the first. Real phones each have their own storage, so this only affects tab-based testing.

## Layout

| Path | What |
|---|---|
| `packages/shared` | Protocol types shared by server and clients |
| `apps/server` | Node server: static files, clip upload, WebSocket relay (`PORT` env, default 8787) |
| `apps/web` | Vite + React. Two pages: `/trainee/` (phones) and `/instructor/` (PC) |
| `data/videos` | Uploaded clips (ignored by git) |

## Run

**Windows:** double-click `start.cmd`, or run it from a terminal. It installs and builds on the first run, then starts the server. Use `build.cmd` after editing anything under `apps/web`.

```bash
C:\Users\taekw\Documents\scoring-test\start.cmd
```

**Mac / Linux:**

```bash
npm install
npm run build
npm start
```

Two Windows PowerShell notes, both avoided by `start.cmd`: `&&` is not a statement separator in PowerShell 5.1 (use `;` or separate lines), and a `Restricted` execution policy blocks `npm.ps1`, so plain `npm` fails with a security error. Writing `npm.cmd` instead of `npm` works without changing any policy.

Open `http://localhost:8787/instructor/` on the PC.

## Giving it to someone else

The instructor's program builds into a single installer, so it runs on a PC that has no Node on it.

`dist.cmd` builds it and leaves three files in `apps\desktop\release\upload`:

| File | What it is |
|---|---|
| `ScoringTest-Setup-<version>.exe` | what a person installs: one click, no administrator rights, a shortcut on the desktop |
| `latest.yml` | how an installed copy learns that a newer one exists |
| `ScoringTest-Setup-<version>.exe.blockmap` | lets it download only the parts that changed |

Attach those three files to a GitHub release and every installed copy finds it by itself: the app reads the newest release of the repository named under `publish` in `apps/desktop/electron-builder.yml`. Nothing is hosted by hand, and a 100 MB file is what releases are for — a plain static host is likely to refuse one. Copies already in someone's hands look at the repository that was named in the installer they received, so changing that name only affects installers built afterwards.

Releasing a fix is: raise `version` in `apps/desktop/package.json`, run `dist.cmd`, and attach the three files to a new release. Nothing has to be carried to anybody.

**Nothing downloads without being asked.** A seminar is the wrong moment to spend the network on a download of this size, so **Later** is a real answer and the app asks again next time it starts. When a download has finished it asks whether to restart; anything recorded up to then is already on disk. With no internet the check fails quietly into the log and the app works as usual.

**Clips and records** live in `%APPDATA%\Scoring Test\data`, which an update never touches. The menu opens that folder (**Data folder**) and the log (**Log**) — the log is the first thing to ask for when someone says it will not start. The version is beside the title on screen and in the menu, so it takes one question to find out what someone is running.

To try the same program from the source tree, without building an installer:

```bash
npm run desktop
```

## Network

Pick how phones connect in the **Network** card on the instructor page. The choice only changes the setup steps shown and the group size; the PC's actual network is whatever Windows is connected to.

| Mode | When | Group size | Watch out for |
|---|---|---|---|
| Wi-Fi router (default) | Seminars with a router you control | 5 | Client isolation (プライバシーセパレーター) must be off. Venue Wi-Fi usually has it on. |
| Tethering | Day-before-tournament sessions, no router | 4 | iPhone hotspots allow about 5 devices and the PC counts as one. Android hotspots usually allow more. |

If the PC is on an iPhone hotspot (address `172.20.10.x`) while Wi-Fi mode is selected, the page offers to switch.

## Languages

Both screens start in English and switch to Japanese from the selector at the top. Each device remembers its own choice, so a trainee can read Japanese while the instructor's PC stays in English. Official WT terms (Chung, Hong, Gam-jeom) stay romanized in every language.

All text lives in `apps/web/src/i18n.ts`. To add a language, copy the `en` dictionary, translate it, and add it to `DICTS` and `LANG_NAMES`; the type checker lists any string you missed. Terminal output from the server stays in English.

Clip file names keep their original characters in any script. Only characters a file system or URL cannot hold (`\ / : * ? " < > |` and control characters) are replaced with `_`. Phones scan the QR code (same Wi-Fi, router must allow device-to-device traffic). Windows will ask to allow Node through the firewall the first time.

Development with hot reload:

```bash
npm run dev
```

Then use the Vite URL (port 5173) instead; it proxies to the server on 8787.
