# Uptime Monitor

GitHub Actions cron job that pings services every 5 minutes and writes results to a [public Gist](https://gist.github.com/swantron/29651cabd005a75bac63afb74339ad74).

> **Which tool for what?** uptime-monitor is the **continuous heartbeat**: black-box pings every 5 min, persisted uptime % and incident history over time. It is deliberately simple (one file, a Gist, no infrastructure) and observe-only — it never gates a deploy. The complementary tool is [**watchtron**](https://github.com/swantron/watchtron), the **deploy gate**, which on each deploy proves the new build is serving real traffic end-to-end (trace correlation, version assertion) and fails the deploy if not. They compose: tronswan.com/status and watchtron's dashboard overlay watchtron's **verified-deploy markers** on this monitor's **uptime timeline**, so a deploy that caused a dip is visible at a glance. Pure uptime → here; "did this deploy ship working?" → watchtron.

## Monitored Services

| Service | URL | Method |
|---------|-----|--------|
| tronswan.com | https://tronswan.com | HEAD |
| chomptron.com | https://chomptron.com | HEAD |
| swantron.com | https://swantron.com | HEAD |
| ATProto PDS | https://jswan.dev/xrpc/_health | GET |
| mt.services | https://mt.services | HEAD |
| MLB Stats API | https://statsapi.mlb.com/api/v1/standings?leagueId=103,104 | GET |
| wrenchtron.com | https://wrenchtron.com | HEAD |

## How It Works

1. `monitor.js` pings each service and records status + response time
2. Reads existing data from the Gist, appends the new check
3. Computes uptime percentages and tracks incidents (up/down transitions)
4. Prunes data older than 7 days (and caps at 500 checks)
5. Writes updated JSON back to the Gist

The [tronswan.com/status](https://tronswan.com/status) page fetches the Gist for real uptime data.

## Setup

Requires two repository secrets:

- `GIST_ID` — the Gist ID to write to
- `GH_PAT` — a personal access token with `gist` scope
