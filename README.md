# Shift Points

An offline web app for youth hockey coaches. Coaches award points when kids hit shift goals. Goals can be for one player, a line, or the whole team. Coaches can also track things across games, such as Player of the Game and who started.

**App:** https://kennyjoseph.github.io/shift-points/ (open it in Safari, then Share → Add to Home Screen)

## Tabs

- **Game**: create a game, then set its lineup: who's here, that game's lines, and the 3–5 goals in play. Tap **Go Live**, tap a goal, pick everyone who earned it (tap a line name to select the whole line), then **Apply**.
- **Roster**: the team's players and the default lines that new games start from.
- **Goals**: the full list of goals.
- **Stats**: a grid you can switch between Players, Lines and Team, with columns by goal or by game. Overall score = tallies × each goal's points. Changing a goal's points re-scores every game.
- **Trackers**: counts across games (Player of the Game, Started the Game, and any you add).

Everything is saved on the device first, so the app works with no signal.

## Google Sheet sync

Several coaches can share one set of data through a Google Sheet. Changes queue on each device and send in the background when there's a connection. If a send fails partway, the device just resends; nothing is double-counted.

The Sheet's script ([`apps-script/Code.gs`](apps-script/Code.gs)) is deliberately simple. It only stores changes and writes whatever summary tabs the app sends. **App updates never require touching the Sheet.**

**One-time setup (head coach):**

1. Create a Google Sheet, then open **Extensions → Apps Script**.
2. Replace everything there with the contents of `apps-script/Code.gs`. Change `TEAM_CODE` from `change-me` to your team code, then click **Save**.
3. Click **Deploy → New deployment**, click the gear icon, choose **Web app**, and set Execute as: **Me** and Who has access: **Anyone**. Click **Deploy** and approve the permissions prompt.
4. Copy the web app URL (it ends in `/exec`) and set `TEAM_SHEET_URL` in `index.html` to it.

**Each coach:** open the app, then **Share → Add to Home Screen**. On the Game tab, enter the team code and your name and tap **Join**. Coaches who are already connected can tap the sync button and then **Invite a coach** to send a one-tap join link.

The first device to join sends its data to the Sheet. Devices that join later load the team's data.

**Sheet tabs:** Tally (one row per game × period × goal × person, good for pivot tables), Players, Games, Lines, Awards, Trackers, Goals, Roster, and Log. Log is the raw change history, so don't edit it.
