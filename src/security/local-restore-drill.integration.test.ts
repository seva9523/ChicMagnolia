import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function executable(path: string, content: string) {
  writeFileSync(path, content, 'utf8');
  chmodSync(path, 0o700);
}

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('local restore drill command flow', () => {
  it('filters hosted role settings, restores through loopback and cleans up', () => {
    const fixtureRoot = temporaryDirectory('chicmagnolia-local-restore-test-');
    const backupDirectory = join(fixtureRoot, 'restored-backup');
    const reportDirectory = join(fixtureRoot, 'reports');
    const fakeBin = join(fixtureRoot, 'bin');
    const dockerLog = join(fixtureRoot, 'docker.log');
    const supabaseLog = join(fixtureRoot, 'supabase.log');

    mkdirSync(backupDirectory);
    mkdirSync(fakeBin);

    const fixtureFiles = {
      'roles.sql': [
        'ALTER ROLE "postgres" SET "log_min_messages" TO \'fatal\';',
        'CREATE ROLE "app_fixture";',
        '',
      ].join('\n'),
      'schema.sql': '-- schema fixture\n',
      'data.sql': '-- data fixture\n',
    } as const;

    for (const [name, content] of Object.entries(fixtureFiles)) {
      writeFileSync(join(backupDirectory, name), content, 'utf8');
    }

    const manifest = [
      'generated_at_utc=2026-08-02T07:49:54Z',
      'source_git_sha=test-source-sha',
      'workflow_run_id=30738550186',
      'supabase_cli_version=test',
      `roles_bytes=${Buffer.byteLength(fixtureFiles['roles.sql'])}`,
      `schema_bytes=${Buffer.byteLength(fixtureFiles['schema.sql'])}`,
      `data_bytes=${Buffer.byteLength(fixtureFiles['data.sql'])}`,
      '',
    ].join('\n');
    writeFileSync(join(backupDirectory, 'manifest.txt'), manifest, 'utf8');

    const checksumLines = [
      'roles.sql',
      'schema.sql',
      'data.sql',
      'manifest.txt',
    ]
      .map((name) => `${sha256(join(backupDirectory, name))}  ${name}`)
      .join('\n');
    writeFileSync(
      join(backupDirectory, 'manifest.sha256'),
      `${checksumLines}\n`,
      'utf8',
    );

    executable(
      join(fakeBin, 'docker'),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${dockerLog}"
if [ "\${1:-}" = 'network' ] && [ "\${2:-}" = 'inspect' ]; then
  printf '127.0.0.1\n'
fi
`,
    );
    executable(join(fakeBin, 'nc'), '#!/usr/bin/env bash\nexit 1\n');
    executable(
      join(fakeBin, 'supabase'),
      `#!/usr/bin/env bash
set -euo pipefail
workdir=''
network_id=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --workdir)
      workdir=$2
      shift 2
      ;;
    --network-id)
      network_id=$2
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
printf '%s|%s|%s\n' "$workdir" "$network_id" "$*" >> "${supabaseLog}"
case "$*" in
  init)
    [ -n "$workdir" ]
    mkdir -p "$workdir/supabase"
    ;;
  'db start'|'stop --no-backup')
    [ -n "$workdir" ]
    [ -n "$network_id" ]
    ;;
  *)
    echo "unexpected supabase command: $*" >&2
    exit 2
    ;;
esac
`,
    );
    executable(
      join(fakeBin, 'psql'),
      `#!/usr/bin/env bash
set -euo pipefail
first_file=''
has_file=false
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--file' ]; then
    has_file=true
    shift
    if [ -z "$first_file" ]; then
      first_file=$1
    fi
  fi
  shift
done

if [ "$has_file" = true ]; then
  if grep -qi 'log_min_messages' "$first_file"; then
    echo 'hosted log_min_messages statement reached psql' >&2
    exit 3
  fi
  grep -q 'CREATE ROLE "app_fixture";' "$first_file"
  exit 0
fi

cat >/dev/null
cat <<'EOF'
restore_verified_at_utc=2026-08-03T14:30:00Z
postgres_server_version=17.6
database_host_binding=127.0.0.1
auth_users=1
profiles=1
tracked_purchases=0
price_checks=0
notification_history=0
subscriptions=0
legal_acceptances=1
support_requests=0
stripe_webhook_events=0
rls_verification=passed
service_role_queue_verification=passed
internal_function_privilege_verification=passed
EOF
`,
    );

    const result = spawnSync(
      'bash',
      [
        join(process.cwd(), 'scripts', 'restore-backup-locally.sh'),
        backupDirectory,
        reportDirectory,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          KEEP_LOCAL_RESTORE: '0',
        },
        timeout: 30_000,
      },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(
      'Skipped 1 hosted-only log_min_messages role configuration statement(s).',
    );
    expect(result.stdout).toContain(
      'Local restore drill completed successfully.',
    );

    const reports = readdirSync(reportDirectory);
    expect(reports).toHaveLength(1);
    const report = readFileSync(join(reportDirectory, reports[0]), 'utf8');
    expect(report).toContain('source_git_sha=test-source-sha');
    expect(report).toContain('roles_compatibility_statements_skipped=1');
    expect(report).toContain('database_host_binding=127.0.0.1');
    expect(report).toContain('auth_users=1');
    expect(report).toContain('rls_verification=passed');
    expect(report).not.toContain('-- data fixture');

    const supabaseCalls = readFileSync(supabaseLog, 'utf8');
    const callLines = supabaseCalls.trim().split('\n');
    const initCall = callLines.find((line) => line.endsWith('||init'));
    expect(initCall).toBeTruthy();
    const workdir = initCall?.split('|')[0];
    expect(workdir).toBeTruthy();
    if (!workdir) {
      throw new Error('Expected the helper to pass an explicit Supabase workdir.');
    }
    expect(workdir).not.toBe(process.cwd());

    const startCall = callLines.find((line) => line.endsWith('|db start'));
    expect(startCall).toBeTruthy();
    const networkId = startCall?.split('|')[1];
    expect(networkId).toMatch(/^chicmagnolia-restore-/);
    if (!networkId) {
      throw new Error('Expected the helper to pass a restore Docker network.');
    }
    expect(callLines).toContain(`${workdir}|${networkId}|stop --no-backup`);

    const dockerCalls = readFileSync(dockerLog, 'utf8');
    expect(dockerCalls).toContain(
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
    );
    expect(dockerCalls).toContain(`network inspect ${networkId}`);
    expect(dockerCalls).toContain(`network rm ${networkId}`);

    expect(existsSync(workdir)).toBe(false);
  });
});
