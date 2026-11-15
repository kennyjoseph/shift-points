# Shift Points

An offline web app for youth hockey coaches. Coaches award points when kids hit shift goals. Goals can be for one player, a line, or the whole team. Coaches can also track things across games, such as Player of the Game and who started.

**App:** https://kennyjoseph.github.io/shift-points/ (open it in Safari, then Share → Add to Home Screen)

## Tabs

- **Game**: create a game, then set its lineup: who's here, that game's lines, and the 3–5 goals in play. Tap **Go Live**, pick a goal at the top, and tap each player, line or team that earned it.
- **Roster**: the team's players and the default lines that new games start from.
- **Goals**: the full list of goals.
- **Stats**: a grid you can switch between Players, Lines and Team, with columns by goal or by game. Overall score = tallies × each goal's points. Changing a goal's points re-scores every game.
- **Trackers**: counts across games (Player of the Game, Started the Game, and any you add).

Everything is saved on the device first, so the app works with no signal.

## Google Sheet sync

Sync lets several coaches share one set of data. Changes queue on each device and send in the background when there's a connection. If the connection drops partway through, the device just resends; nothing is double-counted.

**One-time setup (head coach):**

1. Create a new Google Sheet, e.g. "Shift Points 2026-27".
2. In the Sheet, open **Extensions → Apps Script**.
3. Delete what's there, then paste in all of [`apps-script/Code.gs`](apps-script/Code.gs).
4. Change `TEAM_CODE` near the top of the server section (search for `change-me`) to a code only your coaches know. Click **Save**.
5. Click **Deploy → New deployment**. Click the gear icon, choose **Web app**, and set:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**, approve the permissions prompt, and copy the **Web app URL** (it ends in `/exec`).

**On each coach's device:**

1. In the app, tap **Sync off** in the top bar (on a phone it's the small dot).
2. Paste the web app URL, enter the team code and your name, and tap **Connect**.
   - The first device to connect sends its data to the Sheet.
   - Devices that connect later load the team's data from the Sheet. This replaces whatever was on that device.

The Sheet gets these tabs, rebuilt after each sync: **Tally** (one row per game × goal × person, good for pivot tables), **Trackers**, **Tracker Log**, **Players**, **Games**, **Lines**, **Awards**, **Goals**, **Roster**, and **Log**. Log is the raw change history that the other tabs are built from, so don't edit it.

**If you change `Code.gs` later:** go to **Deploy → Manage deployments**, click the pencil icon, choose **Version: New version**, and click **Deploy**. The URL stays the same.
