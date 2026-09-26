// Starts/stops a disposable Grafana with the demo dashboard (Docker required).
//   node scripts/grafana.mjs up [version] [port]
//   node scripts/grafana.mjs down
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [command = 'up', version = process.env.GRAFANA_VERSION || '13.2.2', port = process.env.GRAFANA_PORT || '3000'] =
  process.argv.slice(2);
const name = 'grafana-snapshot-dev';

function docker(...args) {
  try {
    return execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (e) {
    throw new Error(String(e.stderr || e.message).trim());
  }
}

function remove() {
  try {
    docker('rm', '-f', name);
  } catch {
    /* not running */
  }
}

if (command === 'down') {
  remove();
  console.log('Grafana stopped.');
  process.exit(0);
}

remove();
try {
  docker(
    'run', '-d', '--name', name, '-p', `${port}:3000`,
    '-e', 'GF_AUTH_ANONYMOUS_ENABLED=true',
    '-e', 'GF_AUTH_ANONYMOUS_ORG_ROLE=Admin',
    '-e', 'GF_AUTH_DISABLE_LOGIN_FORM=true',
    '-e', 'GF_NEWS_NEWS_FEED_ENABLED=false',
    '-v', `${path.join(root, 'test/grafana/provisioning')}:/etc/grafana/provisioning:ro`,
    '-v', `${path.join(root, 'test/grafana/dashboards')}:/var/lib/grafana/dashboards:ro`,
    `grafana/grafana:${version}`
  );
} catch (e) {
  console.error(`Could not start Grafana ${version}: ${e.message}`);
  remove();
  process.exit(1);
}

const url = `http://localhost:${port}`;
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${url}/api/health`)).ok) {
      console.log(`Grafana ${version} ready: ${url}/d/demo`);
      process.exit(0);
    }
  } catch {
    /* still starting */
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.error('Grafana did not become healthy in time');
process.exit(1);
