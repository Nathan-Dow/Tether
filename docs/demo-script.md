# Demo video script (about 3:10)

The story: *a focus copilot has to see your screen, and your desk, so it must run on your machine.* We prove it by recording the entire demo with the Wi-Fi off.

If you need to get back to about 2:45, cut the Resume Flow segment (1:50–2:15) and keep the Vision Sentinel one. It's the more visual of the two.

## Before you hit record

- [ ] In PowerShell: `$env:TETHER_RESUME_MIN=1; npm start`. The welcome-back card then appears after 1 minute away instead of 5.
- [ ] Run `ollama run qwen2.5:1.5b "hi"` once so the model is warm (the first call is slow).
- [ ] Open these and keep them ready: VS Code on a real file, Chrome with a YouTube video tab, and a Stack Overflow or docs tab about the same topic as your goal.
- [ ] Turn on Windows Focus Assist / Do Not Disturb so no notifications pop up. Hide the desktop icons if they're busy.
- [ ] Turn the speaker volume up so the audio cues are audible in the recording.
- [ ] Optional: do one short real sprint beforehand so the dashboard has your own data. Otherwise use **Demo day**.
- [ ] Run `npm run setup:vision` once, while you still have internet.
- [ ] Turn the Vision Sentinel **on**: `Ctrl+Shift+K`, click the **eye** at the top of the goal card (it turns green), then `Esc`. It's remembered, and it has to be on *before* the voice goal starts the sprint.
- [ ] Camera check: press `Ctrl+Alt+V`. Your face points should be blue and the verdict should read `VISION SENTINEL: LOCKED`. Hold your phone up the way you'd scroll it, face-on to the camera, and find a grip that gets an amber **cell phone** box. Edge-on or hidden behind your fingers, it gets missed. Light your face from the front, not from a window behind you. Press `Ctrl+Alt+V` again to close it.
- [ ] Have your phone on the desk, screen down, within reach.
- [ ] Record at 1080p with system audio and the mic (Xbox Game Bar `Win+Alt+R`, or OBS).

Real drift detection takes about 16 s (two 8-second checks). Leave it in and speed it up in the edit, or cut the wait. Don't fake it with `Ctrl+Shift+D` unless the real one fails on the day.

---

## 0:00–0:15 · Hook

**Screen:** Desktop with VS Code open. The island is at the top, collapsed.

**Say:** "To keep you focused, an app has to know what you're looking at: every window title, all day. I don't want that going to a cloud API. So Tether runs the AI on my laptop."

## 0:15–0:30 · Wi-Fi off

**Screen:** Click the Wi-Fi icon in the taskbar, turn Wi-Fi **off**, and hold on the "Not connected" state for a second.

**Say:** "Wi-Fi off. Everything you see from here runs offline: a 1.5-billion-parameter model through Ollama, and whisper.cpp for speech."

## 0:30–0:55 · Voice goal

**Screen:** Press `Ctrl+Shift+Space` and say clearly: *"Let's spend 30 minutes refactoring the auth middleware and fixing the tests."* The island shows the level meter, then "thinking", then the goal card with the title, **30 min** and a domain chip. It counts down 3, 2, 1, the sprint starts and the start chime plays.

**Say:** "I just say what I'm doing. Whisper transcribes it on my CPU in under a second, and the local model turns it into a sprint: goal, length, area."

## 0:55–1:25 · Drift

**Screen:**
1. Work in VS Code for a few seconds. The pill stays calm, with the countdown and the green heartbeat.
2. Switch to the Stack Overflow / docs tab. Nothing happens.
3. Switch to YouTube. About 16 s later (speed this up in the edit) the island turns **amber**, the drift cue plays, and the card shows "YouTube", the confidence and a nudge.
4. Click **Back to it** and return to VS Code. (**It's related** tells Tether it was wrong.)

**Say:** "Every 8 seconds the model checks the window against my goal. Docs about my task count as work. YouTube doesn't, and after two confident checks Tether nudges me back. Each check takes about 380 milliseconds on this laptop."

## 1:25–1:50 · Vision Sentinel

**Screen:**
1. Point at the small `LOCKED` eye badge in the pill, next to the timer.
2. Press `Ctrl+Alt+V`. The preview opens: your camera feed, a green **person** box, blue face points, head angles and the inference time.
3. Pick up your phone and scroll it. An amber **cell phone** box appears in the preview. Within about 7 s the island turns **amber**: *Physical drift · Smartphone detected · Return attention to sprint.*
4. Put the phone down. The card clears on its own (or click **Back to it**). Close the preview with `Ctrl+Alt+V`.

**Say:** "Everything so far works without a webcam. But blocking websites is easy to beat: you just pick up your phone. So I've turned on the optional Vision Sentinel, and once every 7 seconds Tether looks at one small webcam frame. Two models run on my CPU in about a tenth of a second: is someone at the desk, is there a phone in their hand, and where is their head pointed? Phone in hand, that's physical drift. Head down at my lap for fifteen seconds, same thing. The frame is checked in memory and thrown away. Nothing is saved, nothing is uploaded."

**Optional, if you have time:** with the preview open, look down at your lap. The face points turn amber and the verdict reads `HEAD DOWN`.

## 1:50–2:15 · Resume Flow

**Screen:** Go to YouTube (or the desktop) and stay there for just over 1 minute. Cut most of the wait. Come back to VS Code and the **Welcome back** card appears: your file, your last command, a one-line note, and **Copy resume prompt**.

**Say:** "When I come back from a rabbit hole, Tether rebuilds where I was from the last 15 minutes, again entirely on-device."

## 2:15–2:55 · Dashboard

**Screen:** Open the island (`Ctrl+K`), click **End sprint** to show the **summary card** (deep flow, drift, flow score, ribbon), then click the **Dashboard** button. Switch to **Demo day** if your own data is thin. Then show, in order:
1. The **Attention residue timeline**, hovering one amber minute.
2. The **Cognitive leak leaderboard**: **Smartphone** sits next to YouTube and Discord.
3. The **Friction debt** card: point at the **Physical drift · phone** row.
4. The **Vision Sentinel** card: at the desk %, eyes on screen %, phone pickups, head-down spells.
5. The **Activity stream**: click the State on a row and pick *Always on-task*, and the scores re-calculate.
6. The **Ambient activity** card (15-minute buckets).

Your own sprint from a minute ago has the real pickup in it. **Demo day** also has one sprint recorded with the Vision Sentinel on ("Ship the password reset email"), so the vision card and the phone rows are populated there too.

**Say:** "After the sprint I can see exactly where my attention went: minute by minute, which sites leaked it, how deep the rabbit holes went. With the webcam on, the phone counts too: it's on the leaderboard and it cost me flow score, and I get time at the desk and eyes on screen. If the model gets a site wrong, one click teaches it. And Ambient Mode logs a whole afternoon without a single pop-up."

## 2:55–3:10 · Close

**Screen:** Back on the summary or the Sprints list, click **.ics**, save it, and show the file. Then show the Wi-Fi icon, still off.

**Say:** "Exported to my calendar, still offline. Tether: a focus copilot that sees your screen and your desk, and sends nothing."

---

## If something goes wrong on the day

| Problem | Fallback |
|---|---|
| Voice mishears you | Click the goal text and fix it (that stops the countdown), or type the goal with `Ctrl+Shift+K` |
| Drift doesn't fire | Stay on the distracting window longer (a vague tab title is a weak signal), or use `Ctrl+Shift+D` |
| Welcome back doesn't appear | `Ctrl+Shift+R` shows the demo card |
| Summary has no data | `Ctrl+Shift+S` shows the demo summary |
| AI status says offline | Ollama isn't running: start it, or say "and with Ollama off it falls back to rules" |
| Phone isn't detected (bad light, wrong angle) | Hold it face-on and higher, nearer your face. If it still misses, press `Ctrl+Shift+W` for the same amber card (it's labelled "demo" in small print), and press it again to clear |
| No eye badge in the pill during the sprint | The Vision Sentinel is off: open the goal card and click the eye. It applies to the running sprint straight away |
| Badge says `NO CAM` | Another app (Zoom, Teams, OBS's camera source) has the webcam. Close it, end the sprint and start a new one. Or use `Ctrl+Shift+W` |
| Recording software needs the camera too | Share-capable cameras usually work. If not, record the screen only and use the preview window as your "camera" shot |
