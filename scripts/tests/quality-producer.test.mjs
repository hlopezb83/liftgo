import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const source=readFileSync('scripts/quality-producer.py','utf8');
for (const failing of ['none','static','build-smoke','both']) {
  test(`producer waits for both branches and fails closed: ${failing}`, t=>{
    const dir=mkdtempSync(path.join(tmpdir(),'quality-producer-'));
    t.after(()=>rmSync(dir,{recursive:true,force:true})); mkdirSync(path.join(dir,'scripts'));
    for (const branch of ['static','build-smoke']) {
      const other=branch==='static'?'build-smoke':'static';
      writeFileSync(path.join(dir,`scripts/quality-${branch}.sh`),`set -eu\ntouch ${branch}.started\nfor i in $(seq 1 100); do test -f ${other}.started && break; sleep .01; done\ntest -f ${other}.started\ntouch ${branch}.done\nexit ${failing===branch||failing==='both'?7:0}\n`);
    }
    writeFileSync(path.join(dir,'scripts/quality-producer.py'), source);
    writeFileSync(path.join(dir,'scripts/run-browser-acceptance.py'),readFileSync('scripts/run-browser-acceptance.py'));
    const result=spawnSync('python3',['scripts/quality-producer.py'],{cwd:dir,timeout:5000});
    assert.equal(result.status,failing==='none'?0:1,result.stderr?.toString());
    assert.ok(existsSync(path.join(dir,'static.done')));
    assert.ok(existsSync(path.join(dir,'build-smoke.done')));
  });
}

test('producer cancellation reaps TERM-resistant detached descendants within a bound', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'quality-producer-cancel-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'scripts'));
  writeFileSync(path.join(dir, 'scripts/quality-producer.py'), source);
  writeFileSync(path.join(dir, 'scripts/run-browser-acceptance.py'), readFileSync('scripts/run-browser-acceptance.py'));
  // The fixture grandchild starts another session and ignores TERM, just as a
  // detached web server can. Only the producer's descendant cleanup may reap it.
  writeFileSync(path.join(dir, 'scripts/stubborn.py'), `import os, signal, time\nfrom pathlib import Path\nos.setsid()\nsignal.signal(signal.SIGTERM, signal.SIG_IGN)\nPath('grandchild.pid').write_text(str(os.getpid()))\nwhile True: time.sleep(.1)\n`);
  writeFileSync(path.join(dir, 'scripts/quality-static.sh'), 'python3 scripts/stubborn.py &\nwait\n');
  writeFileSync(path.join(dir, 'scripts/quality-build-smoke.sh'), 'sleep 60\n');
  const harness = `
import os, signal, subprocess, time
from pathlib import Path
producer = subprocess.Popen(['python3', 'scripts/quality-producer.py'])
identity = None
try:
    deadline = time.monotonic() + 3
    while not Path('grandchild.pid').exists() and time.monotonic() < deadline:
        time.sleep(.01)
    assert Path('grandchild.pid').exists(), 'detached fixture did not start'
    pid = int(Path('grandchild.pid').read_text())
    stat = Path(f'/proc/{pid}/stat')
    identity = (pid, stat.read_text().rsplit(')', 1)[1].split()[19])
    started = time.monotonic()
    producer.send_signal(signal.SIGTERM)
    assert producer.wait(timeout=7) == 143, 'signal status must propagate'
    assert time.monotonic() - started < 7, 'cleanup exceeded its bound'
    assert not stat.exists(), 'detached TERM-resistant grandchild survived'
finally:
    if producer.poll() is None:
        producer.kill()
        producer.wait()
    # Best-effort fixture-only cleanup on an assertion failure. Match starttime
    # before signaling so a recycled PID can never target another process.
    if identity:
        pid, stamp = identity
        stat = Path(f'/proc/{pid}/stat')
        if stat.exists() and stat.read_text().rsplit(')', 1)[1].split()[19] == stamp:
            os.kill(pid, signal.SIGKILL)
`;
  const result = spawnSync('python3', ['-c', harness], { cwd: dir, timeout: 12000 });
  assert.equal(result.status, 0, result.stderr?.toString());
});
