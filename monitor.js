const GIST_ID = process.env.GIST_ID;
const GH_PAT = process.env.GH_PAT;
const GIST_FILENAME = 'uptime.json';
const MAX_AGE_DAYS = 30;

const SERVICES = {
  tronswan: { url: 'https://tronswan.com', method: 'HEAD' },
  chomptron: { url: 'https://chomptron.com', method: 'HEAD' },
  swantron: { url: 'https://swantron.com', method: 'HEAD' },
  jswan: { url: 'https://jswan.dev/xrpc/_health', method: 'GET' },
  mtServices: { url: 'https://mt.services', method: 'HEAD' },
  mlbApi: {
    url: 'https://statsapi.mlb.com/api/v1/standings?leagueId=103,104',
    method: 'GET',
  },
};

async function checkService(name, { url, method }) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    const ms = Date.now() - start;
    const up = res.status >= 200 && res.status < 400;
    console.log(`  ${name}: ${up ? 'UP' : 'DOWN'} (${res.status}) ${ms}ms`);
    return { up, ms };
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`  ${name}: DOWN (${err.message}) ${ms}ms`);
    return { up: false, ms };
  }
}

async function readGist() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      Authorization: `token ${GH_PAT}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to read gist: ${res.status} ${await res.text()}`);
  }
  const gist = await res.json();
  const file = gist.files[GIST_FILENAME];
  if (!file) {
    return null;
  }
  return JSON.parse(file.content);
}

async function writeGist(data) {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${GH_PAT}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2),
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to write gist: ${res.status} ${await res.text()}`);
  }
}

function pruneOldChecks(checks) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return checks.filter((c) => new Date(c.time).getTime() > cutoff);
}

function computeServices(checks, currentResults) {
  const services = {};
  for (const [name, config] of Object.entries(SERVICES)) {
    let totalChecks = 0;
    let healthyChecks = 0;
    let totalMs = 0;
    let msCount = 0;

    for (const check of checks) {
      const result = check.results[name];
      if (result) {
        totalChecks++;
        if (result.up) healthyChecks++;
        if (result.ms != null) {
          totalMs += result.ms;
          msCount++;
        }
      }
    }

    const current = currentResults[name];
    services[name] = {
      url: config.url,
      status: current?.up ? 'up' : 'down',
      uptimePercent:
        totalChecks > 0
          ? Math.round((healthyChecks / totalChecks) * 10000) / 100
          : 100,
      avgResponseMs: msCount > 0 ? Math.round(totalMs / msCount) : 0,
      totalChecks,
      healthyChecks,
      lastResponseMs: current?.ms ?? 0,
      lastChecked: new Date().toISOString(),
    };
  }
  return services;
}

function updateIncidents(existingIncidents, currentResults, now) {
  const incidents = [...existingIncidents];

  for (const [name, result] of Object.entries(currentResults)) {
    const openIncident = incidents.find(
      (i) => i.service === name && !i.resolved
    );

    if (result.up) {
      if (openIncident) {
        openIncident.resolved = true;
        openIncident.endTime = now;
        openIncident.durationMs =
          new Date(now).getTime() - new Date(openIncident.startTime).getTime();
        console.log(`  Incident resolved: ${name}`);
      }
    } else {
      if (!openIncident) {
        incidents.push({
          service: name,
          status: 'down',
          startTime: now,
          endTime: null,
          durationMs: null,
          resolved: false,
        });
        console.log(`  New incident: ${name}`);
      }
    }
  }

  // Prune old resolved incidents
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return incidents.filter(
    (i) => !i.resolved || new Date(i.startTime).getTime() > cutoff
  );
}

async function main() {
  if (!GIST_ID || !GH_PAT) {
    console.error('Missing GIST_ID or GH_PAT environment variables');
    process.exit(1);
  }

  const now = new Date().toISOString();
  console.log(`Uptime check at ${now}`);

  // Check all services
  console.log('Checking services...');
  const results = {};
  for (const [name, config] of Object.entries(SERVICES)) {
    results[name] = await checkService(name, config);
  }

  // Read existing gist data
  console.log('Reading gist...');
  let data = await readGist();

  if (!data || !data.checks) {
    console.log('No existing data, initializing...');
    data = {
      monitoringSince: now,
      lastCheck: now,
      services: {},
      incidents: [],
      checks: [],
    };
  }

  // Append new check
  data.checks.push({ time: now, results });

  // Prune old checks
  data.checks = pruneOldChecks(data.checks);

  // Compute service stats from all checks
  data.services = computeServices(data.checks, results);

  // Update incidents
  data.incidents = updateIncidents(data.incidents, results, now);

  // Update metadata
  data.lastCheck = now;

  // Write back to gist
  console.log('Writing gist...');
  await writeGist(data);

  console.log('Done!');
}

main().catch((err) => {
  console.error('Monitor failed:', err);
  process.exit(1);
});
