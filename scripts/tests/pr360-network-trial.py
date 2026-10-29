#!/usr/bin/env python3
"""Manual, local-only network experiment. Never starts PostgreSQL or ERP code.

Importing this module is inert. Only a bound, explicitly authorized hosted run may
create resources. The scratch image contains only a locally assembled pause loop.
TRIAL_PASS is not replay authorization and is not an input to the PR360 gate.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import io
import ipaddress
import json
import os
from pathlib import Path
import re
import select
import signal
import socket
import struct
import subprocess
import sys
import tarfile
import threading
import time
import uuid

PURPOSE = 'pr360-network-only'
AUTHORIZATION = 'local-network-only-v1'
REPORT_NAME = 'pr360-network-trial.json'
LABEL = 'io.liftgo.trial.'
CONTEXTS = ('docker-a', 'docker-b', 'native')
CHECKS = ('local_tcp_positive', 'ipv6_positive', 'host_gateway_positive', 'dns_udp_positive',
          'dns_tcp_positive', 'dns_udp_denied', 'dns_tcp_denied', 'ipv4_denied', 'ipv6_denied',
          'drop_counters_increased', 'observers_alive')
ASSEMBLY = b'.global _start\n.text\n_start:\n mov $34,%eax\n syscall\n jmp _start\n'
SAFE_ENV = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LANG': 'C.UTF-8',
            'TZ': 'UTC', 'PYTHONDONTWRITEBYTECODE': '1'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_context(env, head, euid):
    for key, value in {'CI': 'true', 'GITHUB_ACTIONS': 'true', 'RUNNER_ENVIRONMENT': 'github-hosted',
                       'GITHUB_REPOSITORY': 'hlopezb83/liftgo', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                       'GITHUB_JOB': 'trial', 'PR360_TRIAL_AUTHORIZATION': AUTHORIZATION}.items():
        require(env.get(key) == value, 'Unauthorized trial context: ' + key)
    require(type(euid) is int and euid == 0, 'Only the explicitly elevated trial supervisor may run/clean resources')
    require(re.fullmatch(r'[0-9a-f]{40}', head or '') is not None, 'Exact checkout SHA required')
    require(head == env.get('GITHUB_SHA') == env.get('PR360_EXPECTED_SHA'), 'Workflow/ref/checkout SHA mismatch')
    for key in ('GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'SUDO_UID', 'SUDO_GID'):
        require(re.fullmatch(r'[1-9][0-9]*', env.get(key, '')) is not None, 'Missing positive ' + key)
    require(env.get('RUNNER_OS') == 'Linux' and env.get('RUNNER_ARCH') == 'X64', 'Only the reviewed Linux x86_64 runner is supported')
    require(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', env.get('PR360_TRIAL_NONCE', '')) is not None,
            'Workflow-owned trial nonce required')
    return {'sha': head, 'run_id': env['GITHUB_RUN_ID'], 'attempt': env['GITHUB_RUN_ATTEMPT'],
            'job': 'trial', 'runner_uid': int(env['SUDO_UID']), 'runner_gid': int(env['SUDO_GID']), 'nonce': env['PR360_TRIAL_NONCE']}


def private_peer(value):
    ip = ipaddress.IPv4Address(value)
    require(any(ip in ipaddress.ip_network(net) for net in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')),
            'Only observed private bridge peers are accepted')
    return str(ip)


def nft_rules(table, peer_ipv4=None):
    require(re.fullmatch(r'lg360_[0-9a-f]{8}', table or '') is not None, 'Invalid owned table')
    peer = private_peer(peer_ipv4) if peer_ipv4 is not None else None
    rules = []
    # No generic loopback/established exception: Docker DNS is on 127.0.0.11.
    for family, address in (('ip', '127.0.0.1'), ('ip6', '::1')):
        rules += [f'{family} daddr {address} tcp dport 5432 accept',
                  f'{family} daddr {address} tcp sport 5432 ct state established accept']
    if peer:
        rules += [f'ip daddr {peer} tcp dport 5432 accept', f'ip daddr {peer} tcp sport 5432 ct state established accept']
    body = '\n    '.join(rules + ['counter name other_denied drop'])
    return (f'table inet {table} {{\n counter dns_denied {{}}\n counter other_denied {{}}\n'
            ' chain dns_guard {\n  type filter hook output priority -300; policy accept;\n'
            '  udp dport 53 counter name dns_denied drop\n  tcp dport 53 counter name dns_denied drop\n }\n'
            f' chain output {{\n  type filter hook output priority -150; policy drop;\n    {body}\n }}\n}}\n')


def validate_image_metadata(info, expected_id, nonce):
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', expected_id or '') is not None, 'Missing local image identity')
    config = info.get('Config', {})
    require(info.get('Id') == expected_id, 'Unexpected image ID')
    require(config.get('Entrypoint') == ['/inert'] and config.get('User') == '65534:65534', 'Unexpected scratch image startup')
    require(config.get('Labels', {}).get(LABEL + 'purpose') == PURPOSE and
            config.get('Labels', {}).get(LABEL + 'nonce') == nonce, 'Image ownership mismatch')
    require(not any(config.get(k) for k in ('Env', 'Cmd', 'OnBuild', 'Volumes')), 'Unexpected image configuration')
    require(info.get('RootFS', {}).get('Type') == 'layers' and len(info['RootFS'].get('Layers', [])) == 1 and
            re.fullmatch(r'sha256:[0-9a-f]{64}', info['RootFS']['Layers'][0]) is not None,
            'Expected exactly one locally generated scratch layer')


def validate_result(report, context):
    require(report.get('schema_version') == 1 and report.get('kind') == 'real', 'Real current measurements required')
    require(report.get('trial_only') is True and report.get('replay_authorized') is False, 'Trial scope changed')
    for key in ('sha', 'run_id', 'attempt', 'job', 'nonce'):
        require(report.get(key) == context.get(key) and context.get(key) is not None, 'Foreign trial evidence: ' + key)
    require(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', report['nonce']) is not None,
            'Missing owned nonce')
    require(type(report.get('started_at')) is int and type(report.get('finished_at')) is int and
            0 < report['started_at'] < report['finished_at'], 'Invalid real measurement timestamps')
    fixture = report.get('fixture', {})
    require(fixture.get('source_sha256') == hashlib.sha256(ASSEMBLY).hexdigest() and
            re.fullmatch(r'[0-9a-f]{64}', fixture.get('elf_sha256', '')) is not None and
            re.fullmatch(r'sha256:[0-9a-f]{64}', fixture.get('image_id', '')) is not None and
            fixture.get('origin') == 'runner-local-scratch; no registry or Supabase equivalence claimed', 'Local scratch provenance missing/changed')
    rows = report.get('measurements', [])
    require([row.get('context') for row in rows] == list(CONTEXTS), 'Missing/duplicate/unmodeled trial context')
    require(len({row.get('namespace_inode') for row in rows}) == len(CONTEXTS), 'Trial contexts share a namespace')
    for row in rows:
        require(type(row.get('namespace_inode')) is int and row['namespace_inode'] > 0, 'Missing namespace identity')
        require(set(row.get('checks', {})) == set(CHECKS) and all(row['checks'][key] is True for key in CHECKS),
                'Incomplete/failed positive or negative control')
        observations = row.get('observations')
        require(isinstance(observations, dict), 'Raw observations missing')
        identity = observations.get('identity', {})
        require(type(identity.get('pid')) is int and identity['pid'] > 0 and
                re.fullmatch(r'[0-9]+', identity.get('start', '')) is not None and identity.get('netns') == row['namespace_inode'],
                'Namespace/process observation mismatch')
        native = row['context'] == 'native'
        require(observations.get('no_external_interface_or_route') is native, 'Namespace route observation missing')
        if native:
            require(all(observations.get(k) is None for k in ('network_id','container_id','peer_ipv4','host_gateway')) and
                    observations.get('dns_address') == observations.get('dns_expected_A') == '127.0.0.1', 'Unexpected native network')
        else:
            require(all(isinstance(observations.get(k), str) and re.fullmatch(r'[0-9a-f]{64}', observations[k]) is not None
                        for k in ('network_id','container_id')),
                    'Owned Docker identities missing')
            for key in ('peer_ipv4','host_gateway','dns_expected_A'): private_peer(observations.get(key, ''))
            require(observations.get('dns_address') == '127.0.0.11', 'Docker embedded resolver was not exercised')
        def counters(value):
            require(isinstance(value, dict) and set(value) == {'dns_denied','other_denied'} and
                    all(type(v) is int and v >= 0 for v in value.values()), 'Raw counters missing or invalid')
            return value
        initial = counters(observations.get('before_counters')); final = counters(observations.get('after_counters'))
        targets = [('dns-udp', observations['dns_address'], 53), ('dns-tcp', observations['dns_address'], 53),
                   ('ipv4-loopback', '127.0.0.1', 45678)]
        if not native: targets.append(('ipv4-host-gateway', observations['host_gateway'], 45679))
        targets.append(('ipv6-loopback', '::1', 45678))
        probes = observations.get('negative_probes', [])
        require([(p.get('kind'),p.get('address'),p.get('port')) for p in probes] == targets, 'Missing/changed negative targets')
        positives = observations.get('positive_probes', {})
        require(set(positives) == {v[0] for v in targets} and all(v is True for v in positives.values()), 'Positive observer control missing')
        previous = initial
        for probe in probes:
            require(probe.get('blocked') is True, 'Negative probe did not observe a blocked connection')
            before, after = counters(probe.get('before')), counters(probe.get('after'))
            require(all(before[k] >= previous[k] and after[k] >= before[k] for k in initial), 'Counter chronology invalid')
            field = 'dns_denied' if probe['kind'].startswith('dns-') else 'other_denied'
            require(after[field] > before[field], 'Negative probe lacks its own causal DROP delta')
            previous = after
        require(all(final[k] >= previous[k] for k in initial), 'Final counters precede probes')
        receipts = observations.get('observer_receipts_before')
        require(isinstance(receipts, list) and len(receipts) == 3 and all(type(v) is int and v > 0 for v in receipts) and
                receipts == observations.get('observer_receipts_after'), 'Observer not proven alive/drained or received denied traffic')
    cleanup = report.get('cleanup', {})
    require(cleanup.get('status') == 'PASS' and cleanup.get('ownership_verified') is True and cleanup.get('stopped_verified') is True,
            'Cleanup unproven')
    expected_remaining = dict.fromkeys(('containers', 'images', 'networks', 'workers', 'namespaces', 'rules'), 0)
    require(cleanup.get('remaining') == expected_remaining and all(type(v) is int for v in cleanup['remaining'].values()),
            'Owned trial resources remain or inventory is incomplete')
    require(report.get('status') == 'TRIAL_PASS', 'Trial failed or did not finish')
    return 'TRIAL_PASS'


def pid_identity(pid):
    tail = Path(f'/proc/{int(pid)}/stat').read_text().rsplit(') ', 1)[1].split()
    return {'pid': int(pid), 'start': tail[19], 'netns': os.stat(f'/proc/{int(pid)}/ns/net').st_ino}


def same_pid(identity):
    try:
        return pid_identity(identity['pid']) == identity
    except (OSError, ValueError):
        return False


def same_process(identity):
    try:
        observed = pid_identity(identity['pid'])
        return observed['start'] == identity['start']
    except (OSError, ValueError):
        return False


def read_exact(connection, count):
    result = b''
    while len(result) < count:
        part = connection.recv(count-len(result))
        require(bool(part), 'Incomplete local DNS framing'); result += part
    return result


def dns_addresses(packet):
    require(len(packet) >= 12 and int.from_bytes(packet[:2], 'big') == 360 and packet[3] & 15 == 0, 'Invalid local DNS response')
    def skip_name(offset):
        while True:
            require(offset < len(packet), 'Truncated DNS name'); size = packet[offset]; offset += 1
            if size & 0xc0 == 0xc0:
                require(offset < len(packet), 'Truncated DNS pointer'); return offset+1
            require(size < 64 and offset+size <= len(packet), 'Invalid DNS label')
            if size == 0: return offset
            offset += size
    offset = 12; addresses = []
    for _ in range(int.from_bytes(packet[4:6], 'big')): offset = skip_name(offset)+4
    for _ in range(int.from_bytes(packet[6:8], 'big')):
        offset = skip_name(offset); require(offset+10 <= len(packet), 'Truncated DNS record')
        kind, klass, _, size = struct.unpack_from('!HHIH', packet, offset); offset += 10
        require(offset+size <= len(packet), 'Truncated DNS data')
        if kind == klass == 1 and size == 4: addresses.append(socket.inet_ntoa(packet[offset:offset+4]))
        offset += size
    return addresses


def unprivileged():
    require(os.geteuid() != 0, 'Unprivileged probe required')
    status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines() if ':' in line)
    require(all(int(status[key].strip(), 16) == 0 for key in ('CapEff', 'CapPrm', 'CapAmb')), 'Probe retained capabilities')


def worker(args):
    """Internal protocol, only literal local IPs or owned Docker aliases; no URLs."""
    mode, nonce, host_ns, expected_ns = args[:4]; args = args[4:]
    require(re.fullmatch(r'[0-9a-f-]{36}', nonce or '') is not None, 'Invalid worker nonce')
    current_ns = os.stat('/proc/self/ns/net').st_ino
    if mode == 'anchor':
        require(os.geteuid() == 0 and expected_ns == 'new' and current_ns != int(host_ns), 'Native anchor refused the host namespace')
    elif mode.startswith('host-'):
        require(current_ns == int(expected_ns) == int(host_ns) and os.geteuid() != 0, 'Unprivileged host observer context required')
    else:
        require(current_ns == int(expected_ns) and current_ns != int(host_ns) and os.geteuid() != 0, 'Unprivileged owned namespace required')
    if mode == 'anchor':
        subprocess.run(['/usr/sbin/ip', 'link', 'set', 'lo', 'up'], check=True, env=SAFE_ENV)
        Path('/proc/sys/net/ipv4/ip_unprivileged_port_start').write_text('0')
        os.setgroups([]); os.setgid(int(args[1])); os.setuid(int(args[0]))
        require(ctypes.CDLL(None).prctl(38, 1, 0, 0, 0) == 0, 'Cannot set no-new-privileges')
        unprivileged()
        print(json.dumps(pid_identity(os.getpid())), flush=True)
        while True:
            signal.pause()
    unprivileged()
    if mode in ('server', 'host-server'):
        address, port = args[0], int(args[1]); family = socket.AF_INET6 if ':' in address else socket.AF_INET
        require((mode == 'server' and address in ('0.0.0.0', '127.0.0.1', '::1')) or
                (mode == 'host-server' and private_peer(address) == address), 'Only local listeners')
        server = socket.socket(family, socket.SOCK_STREAM)
        if family == socket.AF_INET6:
            server.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((address, port)); server.listen(8); server.settimeout(1)
        signal.signal(signal.SIGUSR1, lambda *_: print(json.dumps({'barrier': True}), flush=True))
        print(json.dumps({'ready': server.getsockname()[1], **pid_identity(os.getpid()), 'uid': os.getuid()}), flush=True)
        while True:
            try:
                conn, _ = server.accept()
                with conn:
                    conn.settimeout(1)
                    if conn.recv(512).startswith(('GET /'+nonce+' HTTP/1.0\r\n').encode()):
                        print(json.dumps({'receipt': True}), flush=True)
                        conn.sendall(('HTTP/1.0 200 OK\r\nContent-Length: '+str(len(nonce))+'\r\n\r\n'+nonce).encode())
            except socket.timeout:
                pass
    if mode == 'dns-server':
        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); udp.bind(('127.0.0.1', 53))
        tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM); tcp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        tcp.bind(('127.0.0.1', 53)); tcp.listen(8)
        signal.signal(signal.SIGUSR1, lambda *_: print(json.dumps({'barrier': True}), flush=True))
        print(json.dumps({'ready': 53, **pid_identity(os.getpid()), 'uid': os.getuid()}), flush=True)
        while True:
            for server in select.select([udp, tcp], [], [], 1)[0]:
                conn = None
                try:
                    if server is udp: packet, sender = udp.recvfrom(4096)
                    else:
                        conn, _ = tcp.accept(); conn.settimeout(1); packet = read_exact(conn, struct.unpack('!H', read_exact(conn, 2))[0])
                    require(len(packet) >= 12 and int.from_bytes(packet[4:6], 'big') == 1, 'Invalid synthetic DNS question')
                    answer = packet[:2] + struct.pack('!HHHHH', 0x8000, 1, 1, 0, 0) + packet[12:] + b'\xc0\x0c' + struct.pack('!HHIH', 1, 1, 0, 4) + socket.inet_aton('127.0.0.1')
                    print(json.dumps({'receipt': True}), flush=True)
                    if conn: conn.sendall(struct.pack('!H', len(answer))+answer)
                    else: udp.sendto(answer, sender)
                finally:
                    if conn: conn.close()
    address, port = args[0], int(args[1]); ip = ipaddress.ip_address(address)
    require(ip.is_loopback or (ip.version == 4 and private_peer(address) == address), 'Nonlocal probe denied')
    try:
        if mode in ('tcp', 'host-tcp'):
            with socket.create_connection((address, port), timeout=1) as conn:
                conn.sendall(('GET /'+nonce+' HTTP/1.0\r\nHost: local-trial\r\n\r\n').encode())
                reply = b''
                while len(reply) < 1024:
                    part = conn.recv(1024-len(reply))
                    if not part: break
                    reply += part
                ok = reply.startswith(b'HTTP/1.0 200 OK\r\n') and reply.endswith(nonce.encode())
        elif mode in ('dns-udp', 'dns-tcp'):
            name, expected_ip = args[2], args[3]
            require(re.fullmatch(r'lg360_[a-f0-9]{8}_[ab]', name) is not None, 'Only an owned local alias can be queried')
            question = b''.join(bytes([len(v)]) + v.encode() for v in name.split('.')) + b'\0\0\1\0\1'
            packet = struct.pack('!HHHHHH', 360, 0, 1, 0, 0, 0) + question  # no recursion requested
            if mode == 'dns-udp':
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as conn:
                    conn.settimeout(1); conn.sendto(packet, (address, port)); answer = conn.recv(4096)
            else:
                with socket.create_connection((address, port), timeout=1) as conn:
                    conn.sendall(struct.pack('!H', len(packet)) + packet); size = read_exact(conn, 2)
                    answer = read_exact(conn, struct.unpack('!H', size)[0])
            ok = expected_ip in dns_addresses(answer)
        else:
            raise ValueError('Unknown local worker')
        print(json.dumps({'ok': bool(ok)}))
    except (OSError, ValueError):
        print(json.dumps({'ok': False}))


class Trial:
    def __init__(self, context, workspace, runner_temp, existing=False):
        self.context, self.workspace = context, workspace
        self.directory = runner_temp / f"liftgo-pr360-trial-{context['run_id']}-{context['attempt']}"
        self.file = self.directory / 'state.json'; self.deadline = time.monotonic() + 240
        self.processes, self.servers, self.namespace_fds = [], [], {}
        if existing:
            require(self.directory.resolve() == self.directory and self.directory.stat().st_uid == 0 and
                    self.directory.stat().st_mode & 0o077 == 0, 'Unsafe ownership directory')
            self.state = json.loads(self.file.read_text())
            require(all(self.state['context'].get(k) == v for k, v in context.items()), 'Foreign cleanup state')
        else:
            self.directory.mkdir(mode=0o700)
            self.state = {'purpose': PURPOSE, 'context': context, 'nonce': context['nonce'], 'containers': [],
                          'network': None, 'image': None, 'workers': [], 'namespaces': [], 'sandboxes': []}
            self.save()
        require(self.state.get('purpose') == PURPOSE, 'Unknown state purpose')
        require(self.state.get('nonce') == context['nonce'], 'State nonce differs from this workflow invocation')
        self.context = {**context, 'nonce': self.state['nonce']}
        self.short = self.state['nonce'][:8]; self.name = 'lg360_' + self.short
        self.host_ns = os.stat('/proc/self/ns/net').st_ino
        self.report = {'schema_version': 1, 'kind': 'real', 'trial_only': True, 'replay_authorized': False,
                       **{k: self.context[k] for k in ('sha', 'run_id', 'attempt', 'job', 'nonce')},
                       'started_at': time.time_ns() // 1_000_000, 'status': 'FAIL', 'measurements': []}
        self.config = self.directory / 'docker-config'; self.config.mkdir(exist_ok=True)
        (self.config / 'config.json').write_text('{"auths":{}}\n')

    def save(self):
        temporary = self.file.with_suffix('.tmp'); temporary.write_text(json.dumps(self.state)); temporary.chmod(0o600); temporary.replace(self.file)

    def command(self, args, input_data=None, timeout=15, allow_failure=False):
        require(time.monotonic() < self.deadline, 'Trial/cleanup time budget exhausted')
        result = subprocess.run(args, input=input_data, capture_output=True, env=SAFE_ENV, timeout=min(timeout, max(1, self.deadline-time.monotonic())))
        if not allow_failure:
            require(result.returncode == 0, 'Local command failed: ' + Path(args[0]).name)
        return result.stdout

    def docker(self, args, **kwargs):
        return self.command(['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock', '--config', str(self.config), *args], **kwargs)

    def inspect(self, kind, ident):
        return json.loads(self.docker([kind, 'inspect', ident]))[0]

    def namespace(self, ident):
        require(same_pid(ident) and ident['netns'] != os.stat('/proc/self/ns/net').st_ino, 'Namespace/PID identity changed')
        if ident['netns'] not in self.namespace_fds:
            fd = os.open(f"/proc/{ident['pid']}/ns/net", os.O_RDONLY | os.O_CLOEXEC)
            try:
                require(os.fstat(fd).st_ino == ident['netns'] and same_pid(ident), 'Namespace changed while being pinned')
            except Exception:
                os.close(fd); raise
            self.namespace_fds[ident['netns']] = fd
        fd = self.namespace_fds[ident['netns']]
        require(os.fstat(fd).st_ino == ident['netns'] and ident['netns'] != self.host_ns, 'Pinned namespace identity invalid')
        return ['/usr/bin/nsenter', f'--net=/proc/{os.getpid()}/fd/{fd}', '--']

    def user_prefix(self, ident):
        return self.namespace(ident) + ['/usr/bin/setpriv', '--reuid', str(self.context['runner_uid']),
                                      '--regid', str(self.context['runner_gid']), '--clear-groups',
                                      '--inh-caps=-all', '--ambient-caps=-all', '--bounding-set=-all', '--no-new-privs', '--']

    def probe(self, ident, mode, address, port, alias='', expected_ip='127.0.0.1'):
        prefix = self.user_prefix(ident) if ident else ['/usr/bin/setpriv', '--reuid', str(self.context['runner_uid']), '--regid', str(self.context['runner_gid']), '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all', '--bounding-set=-all', '--no-new-privs', '--']
        result = self.command(prefix + [sys.executable, str(Path(__file__).resolve()), '__worker',
                              mode, self.state['nonce'], str(self.host_ns), str(ident['netns'] if ident else self.host_ns),
                              address, str(port), alias, expected_ip], timeout=4)
        return json.loads(result)['ok'] is True

    def start_server(self, ident, address, port, mode='server'):
        prefix = self.user_prefix(ident) if ident else ['/usr/bin/setpriv', '--reuid', str(self.context['runner_uid']), '--regid', str(self.context['runner_gid']), '--clear-groups', '--inh-caps=-all', '--ambient-caps=-all', '--bounding-set=-all', '--no-new-privs', '--']
        args = prefix + [sys.executable, str(Path(__file__).resolve()), '__worker', mode, self.state['nonce'],
                         str(self.host_ns), str(ident['netns'] if ident else self.host_ns), address, str(port)]
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=SAFE_ENV, start_new_session=True)
        identity = pid_identity(process.pid); self.state['workers'].append(identity); self.save(); self.processes.append(process)
        require(select.select([process.stdout], [], [], 5)[0], 'Local observer did not start')
        ready = json.loads(process.stdout.readline())
        require(ready.get('pid') == process.pid and ready.get('uid') == self.context['runner_uid'] and
                ready.get('netns') == (ident['netns'] if ident else self.host_ns), 'Wrong observer namespace/UID')
        identity = {key: ready[key] for key in ('pid','start','netns')}; require(same_pid(identity), 'Observer process changed')
        self.state['workers'][-1] = identity; self.save()
        observer = {'process': process, 'identity': identity, 'receipts': [], 'barrier': threading.Event()}
        def collect():
            for line in process.stdout:
                value = json.loads(line)
                if value.get('receipt') is True:
                    observer['receipts'].append(time.monotonic())
                if value.get('barrier') is True: observer['barrier'].set()
        threading.Thread(target=collect, daemon=True).start(); self.servers.append(observer)
        return observer

    def drain(self, observer):
        require(same_pid(observer['identity']), 'Observer changed during measurement')
        observer['barrier'].clear(); os.kill(observer['identity']['pid'], signal.SIGUSR1)
        require(observer['barrier'].wait(1), 'Observer control-pipe barrier failed')
        return len(observer['receipts'])

    def build_fixture(self):
        source, executable = self.directory / 'inert.S', self.directory / 'inert'
        source.write_bytes(ASSEMBLY)
        self.command(['/usr/bin/gcc', '-nostdlib', '-static', '-Wl,--build-id=none', '-o', str(executable), str(source)])
        binary = executable.read_bytes()
        require(binary[:5] == b'\x7fELF\x02' and int.from_bytes(binary[18:20], 'little') == 62, 'Unexpected fixture executable architecture')
        offset, size, count = struct.unpack_from('<Q', binary, 32)[0], struct.unpack_from('<H', binary, 54)[0], struct.unpack_from('<H', binary, 56)[0]
        require(all(struct.unpack_from('<I', binary, offset+i*size)[0] != 3 for i in range(count)), 'Fixture unexpectedly requires a loader')
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode='w') as tar:
            entry = tarfile.TarInfo('inert'); entry.size = len(binary); entry.mode = 0o555; entry.mtime = 0
            tar.addfile(entry, io.BytesIO(binary))
        image_id = self.docker(['image', 'import', '--change', 'ENTRYPOINT ["/inert"]', '--change', 'USER 65534:65534',
                               '--change', f'LABEL {LABEL}purpose={PURPOSE}', '--change', f'LABEL {LABEL}nonce={self.state["nonce"]}', '-'], input_data=archive.getvalue()).decode().strip()
        self.state['image'] = image_id; self.save()
        validate_image_metadata(self.inspect('image', image_id), image_id, self.state['nonce'])
        self.report['fixture'] = {'source_sha256': hashlib.sha256(ASSEMBLY).hexdigest(), 'elf_sha256': hashlib.sha256(binary).hexdigest(), 'image_id': image_id,
                                  'origin': 'runner-local-scratch; no registry or Supabase equivalence claimed'}

    def create_resources(self):
        label = LABEL + 'nonce=' + self.state['nonce']
        network = self.docker(['network', 'create', '--driver', 'bridge', '--internal', '--label', label, self.name]).decode().strip()
        self.state['network'] = network; self.save(); metadata = self.inspect('network', network)
        require(metadata.get('Internal') is True and metadata.get('Driver') == 'bridge' and metadata.get('Labels', {}).get(LABEL+'nonce') == self.state['nonce'], 'Unowned network')
        gateway = private_peer(metadata['IPAM']['Config'][0]['Gateway']); contexts = []
        for suffix in ('a', 'b'):
            alias = self.name + '_' + suffix
            ident = self.docker(['container', 'create', '--name', alias, '--label', label, '--network', self.name,
                                 '--network-alias', alias, '--entrypoint', '/inert', '--user', '65534:65534', '--read-only', '--cap-drop', 'ALL',
                                 '--pids-limit', '32', '--memory', '32m', '--sysctl', 'net.ipv4.ip_unprivileged_port_start=0',
                                 '--sysctl', 'net.ipv6.conf.all.disable_ipv6=0', '--sysctl', 'net.ipv6.conf.lo.disable_ipv6=0', self.state['image']]).decode().strip()
            self.state['containers'].append(ident); self.save(); self.docker(['container', 'start', ident])
            meta = self.inspect('container', ident)
            require(meta.get('Image') == self.state['image'] and meta['Config'].get('Labels', {}).get(LABEL+'nonce') == self.state['nonce'], 'Unowned container')
            require(set(meta['NetworkSettings']['Networks']) == {self.name}, 'Unexpected extra network')
            require(meta['Config'].get('User') == '65534:65534' and meta['Config'].get('Entrypoint') == ['/inert'] and
                    meta['HostConfig'].get('ReadonlyRootfs') is True and meta['HostConfig'].get('CapDrop') == ['ALL'], 'Unexpected container privilege/startup configuration')
            ns = pid_identity(meta['State']['Pid']); require(ns['netns'] != os.stat('/proc/self/ns/net').st_ino, 'Host namespace refused')
            self.state['namespaces'].append(ns['netns']); self.state['sandboxes'].append(meta['NetworkSettings']['SandboxKey']); self.save()
            contexts.append({'identity': ns, 'container_id': ident, 'alias': alias, 'ip': private_peer(meta['NetworkSettings']['Networks'][self.name]['IPAddress']), 'gateway': gateway})
        return contexts

    def native_context(self):
        args = ['/usr/bin/unshare', '--net', '--fork', '--kill-child=KILL', '--', sys.executable,
                str(Path(__file__).resolve()), '__worker', 'anchor', self.state['nonce'], str(self.host_ns), 'new', str(self.context['runner_uid']), str(self.context['runner_gid'])]
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=SAFE_ENV, start_new_session=True)
        self.state['workers'].append(pid_identity(process.pid)); self.save(); self.processes.append(process)
        require(select.select([process.stdout], [], [], 5)[0], 'Native namespace did not start')
        ident = json.loads(process.stdout.readline()); require(same_pid(ident), 'Native anchor ownership missing')
        self.state['workers'].append(ident); self.state['namespaces'].append(ident['netns']); self.save()
        interfaces = json.loads(self.command(self.namespace(ident) + ['/usr/sbin/ip', '-j', 'link']))
        require([row['ifname'] for row in interfaces] == ['lo'], 'Native context has external interfaces')
        for family in ('-4', '-6'):
            routes = json.loads(self.command(self.namespace(ident) + ['/usr/sbin/ip', family, '-j', 'route']))
            require(all(row.get('dev') == 'lo' and row.get('dst') in ('127.0.0.0/8', '::1', '::1/128') and not row.get('gateway') for row in routes),
                    'Native context has an external route')
        return {'identity': ident, 'alias': self.name+'_a', 'ip': None, 'gateway': '127.0.0.1'}

    def counters(self, ident, table):
        result = json.loads(self.command(self.namespace(ident) + ['/usr/sbin/nft', '-j', 'list', 'table', 'inet', table]))
        return {v['counter']['name']: v['counter']['packets'] for v in result['nftables'] if 'counter' in v and 'packets' in v['counter']}

    def prepare_observers(self, data):
        ident = data['identity']
        data['observers'] = [self.start_server(ident, '0.0.0.0', 5432), self.start_server(ident, '127.0.0.1', 45678),
                             self.start_server(ident, '::1', 45678)]

    def measure(self, name, data, peer=None, host_observer=None):
        ident = data['identity']; table = 'lg360_' + self.short
        local, denied4, denied6 = data['observers']; observers = [local, denied4, denied6]
        checks = {'local_tcp_positive': self.probe(ident, 'tcp', '127.0.0.1', 5432),
                  'ipv6_positive': self.probe(ident, 'tcp', '::1', 45678),
                  'host_gateway_positive': self.probe(ident, 'tcp', data['gateway'], 45679) if peer else self.probe(ident, 'tcp', '127.0.0.1', 45678)}
        # Docker's real embedded resolver must answer the known LOCAL alias on both transports.
        if name.startswith('docker'):
            for protocol in ('udp', 'tcp'):
                checks['dns_'+protocol+'_positive'] = self.probe(ident, 'dns-'+protocol, '127.0.0.11', 53, data['alias'], data['ip'])
        else:
            observers.append(self.start_server(ident, '127.0.0.1', 53, mode='dns-server'))
            for protocol in ('udp', 'tcp'):
                checks['dns_'+protocol+'_positive'] = self.probe(ident, 'dns-'+protocol, '127.0.0.1', 53, data['alias'])
        require(all(checks.values()), 'A local positive observer/control failed; no containment claim')
        positive_probes = {'dns-udp': checks['dns_udp_positive'], 'dns-tcp': checks['dns_tcp_positive'],
                           'ipv4-loopback': self.probe(ident, 'tcp', '127.0.0.1', 45678), 'ipv6-loopback': checks['ipv6_positive']}
        if peer: positive_probes['ipv4-host-gateway'] = checks['host_gateway_positive']
        require(all(positive_probes.values()), 'A negative target lacked a working positive control')
        if host_observer: observers.append(host_observer)
        receipt_before = [self.drain(v) for v in observers[1:]]
        rules = nft_rules(table, peer['ip'] if peer else None).encode()
        self.command(self.namespace(ident) + ['/usr/sbin/nft', '--check', '-f', '-'], input_data=rules)
        self.command(self.namespace(ident) + ['/usr/sbin/nft', '-f', '-'], input_data=rules)
        before = self.counters(ident, table); negative_probes = []
        dns_address = '127.0.0.11' if peer else '127.0.0.1'
        for protocol in ('udp', 'tcp'):
            start = self.counters(ident, table)
            checks['dns_'+protocol+'_denied'] = not self.probe(ident, 'dns-'+protocol, dns_address, 53, data['alias'], data['ip'] or '127.0.0.1')
            end = self.counters(ident, table)
            require(end['dns_denied'] > start['dns_denied'], 'DNS was not caught by the early namespace guard')
            negative_probes.append({'kind': 'dns-'+protocol, 'address': dns_address, 'port': 53,
                                    'blocked': checks['dns_'+protocol+'_denied'], 'before': start, 'after': end})
        def denied(kind, address, port):
            start = self.counters(ident, table); result = not self.probe(ident, 'tcp', address, port)
            end = self.counters(ident, table)
            require(end['other_denied'] > start['other_denied'], 'Negative packet was not caught by the owned namespace guard')
            negative_probes.append({'kind': kind, 'address': address, 'port': port, 'blocked': result, 'before': start, 'after': end})
            return result
        checks['ipv4_denied'] = denied('ipv4-loopback', '127.0.0.1', 45678)
        if peer:
            checks['ipv4_denied'] = denied('ipv4-host-gateway', data['gateway'], 45679) and checks['ipv4_denied']
        checks['ipv6_denied'] = denied('ipv6-loopback', '::1', 45678)
        checks['local_tcp_positive'] = checks['local_tcp_positive'] and self.probe(ident, 'tcp', '127.0.0.1', 5432)
        if peer:
            checks['local_tcp_positive'] = checks['local_tcp_positive'] and self.probe(ident, 'tcp', peer['ip'], 5432)
        after = self.counters(ident, table)
        checks['drop_counters_increased'] = after.get('dns_denied', 0) >= before.get('dns_denied', 0)+2 and after.get('other_denied', 0) >= before.get('other_denied', 0)+2
        receipt_after = [self.drain(v) for v in observers[1:]]
        checks['observers_alive'] = all(v['process'].poll() is None and same_pid(v['identity']) for v in observers) and receipt_before == receipt_after
        require(all(checks.values()), 'A mandatory containment measurement failed')
        self.report['measurements'].append({'context': name, 'namespace_inode': ident['netns'], 'checks': checks,
             'observations': {'identity': ident, 'network_id': self.state['network'] if peer else None,
                 'container_id': data['container_id'] if peer else None,
                 'peer_ipv4': peer['ip'] if peer else None, 'host_gateway': data['gateway'] if peer else None,
                 'dns_address': dns_address, 'dns_expected_A': data['ip'] or '127.0.0.1', 'before_counters': before, 'after_counters': after,
                 'negative_probes': negative_probes, 'positive_probes': positive_probes,
                 'observer_receipts_before': receipt_before, 'observer_receipts_after': receipt_after,
                 'no_external_interface_or_route': not bool(peer)}})

    def cleanup(self):
        self.deadline = time.monotonic() + 90; errors = []
        for ident in reversed(self.state['workers']):
            if same_process(ident):
                try:
                    command_line = Path(f"/proc/{ident['pid']}/cmdline").read_bytes()
                    if self.state['nonce'].encode() not in command_line or Path(__file__).name.encode() not in command_line:
                        errors.append('worker_ownership'); continue
                    os.kill(ident['pid'], signal.SIGKILL)
                except (ProcessLookupError, FileNotFoundError): pass
                except OSError: errors.append('worker_stop')
        for process in self.processes:
            try: process.wait(timeout=3)
            except subprocess.TimeoutExpired: errors.append('worker_stop')
        # Discover only the current nonce label, including a create with uncertain output.
        for kind, listing in (('container', ['container','ls','-aq']), ('network', ['network','ls','-q']), ('image', ['image','ls','-q'])):
            try:
                ids = self.docker(listing + ['--filter', 'label='+LABEL+'nonce='+self.state['nonce']]).decode().split()
                for ident in ids:
                    meta = self.inspect(kind, ident); labels = meta.get('Config', {}).get('Labels', {}) if kind in ('container','image') else meta.get('Labels', {})
                    require(labels.get(LABEL+'nonce') == self.state['nonce'], 'Cleanup ownership mismatch')
                    args = [kind, 'rm'] + (['--force'] if kind in ('container','image') else []) + [ident]
                    self.docker(args)
                require(not self.docker(listing + ['--filter','label='+LABEL+'nonce='+self.state['nonce']]).strip(), 'Owned resource remains')
            except Exception: errors.append(kind+'_cleanup')
        for fd in self.namespace_fds.values():
            try: os.close(fd)
            except OSError: errors.append('namespace_fd_close')
        self.namespace_fds.clear()
        live = [v for v in self.state['workers'] if same_process(v)]
        bound = [path for path in self.state['sandboxes'] if Path(path).exists()]
        inodes = set(self.state['namespaces']); occupied = set()
        for path in Path('/proc').glob('[0-9]*/task/[0-9]*/ns/net'):
            try:
                inode = path.stat().st_ino
                if inode in inodes: occupied.add(inode)
            except (FileNotFoundError, PermissionError, ProcessLookupError): pass
        remaining = dict.fromkeys(('containers','images','networks','workers','namespaces','rules'), 0)
        remaining['workers'] = len(live); remaining['namespaces'] = len(bound)+len(occupied); remaining['rules'] = remaining['namespaces']
        if errors: remaining['containers'] = 1
        return {'status': 'FAIL' if errors or live or bound or occupied else 'PASS', 'ownership_verified': not errors,
                'stopped_verified': not live and not bound and not occupied, 'remaining': remaining}

    def write_report(self):
        path = self.workspace / 'reports' / REPORT_NAME; path.parent.mkdir(exist_ok=True)
        require(path.parent.resolve() == path.parent and not path.is_symlink(), 'Unsafe evidence path')
        temporary = path.with_suffix('.tmp'); require(not temporary.is_symlink(), 'Unsafe evidence temporary path')
        temporary.write_text(json.dumps(self.report, indent=2)+'\n'); temporary.chmod(0o644); temporary.replace(path)

    def run(self):
        def interrupted(_signal, _frame): raise RuntimeError('Trial interrupted')
        signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
        try:
            self.build_fixture(); contexts = self.create_resources()
            host = self.start_server(None, contexts[0]['gateway'], 45679, mode='host-server')
            require(self.probe(None, 'host-tcp', contexts[0]['gateway'], 45679), 'Host gateway observer is not alive')
            for data in contexts: self.prepare_observers(data)
            self.measure('docker-a', contexts[0], contexts[1], host)
            self.measure('docker-b', contexts[1], contexts[0], host)
            native = self.native_context(); self.prepare_observers(native); self.measure('native', native)
            self.report['status'] = 'TRIAL_PASS'
        except Exception as error:
            self.report['failure'] = type(error).__name__ + ': ' + str(error)[:180]
            self.report['status'] = 'FAIL'
        finally:
            self.report['cleanup'] = self.cleanup(); self.report['finished_at'] = time.time_ns() // 1_000_000
            if self.report['cleanup']['status'] != 'PASS': self.report['status'] = 'FAIL'
            self.write_report()
        validate_result(self.report, self.context)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '__worker':
        worker(sys.argv[2:]); return
    parser = argparse.ArgumentParser(); parser.add_argument('operation', choices=('run','cleanup','verify')); args = parser.parse_args()
    workspace = Path(os.environ.get('GITHUB_WORKSPACE', '')).resolve()
    require(workspace == Path.cwd().resolve(), 'Current checkout workspace required')
    head = subprocess.check_output(['/usr/bin/git','-c','safe.directory='+str(workspace),'rev-parse','HEAD'], cwd=workspace, env=SAFE_ENV, text=True).strip()
    subprocess.run(['/usr/bin/git','-c','safe.directory='+str(workspace),'diff','--quiet','HEAD','--',
                    'scripts/tests/pr360-network-trial.py','.github/workflows/pr360-network-trial.yml'], cwd=workspace, env=SAFE_ENV, check=True)
    env = dict(os.environ)
    if args.operation == 'verify':
        # Read-only consumer runs as the normal runner; bind its UID/GID explicitly.
        env['SUDO_UID'], env['SUDO_GID'] = str(os.getuid()), str(os.getgid())
    context = validate_context(env, head, 0 if args.operation == 'verify' else os.geteuid())
    runner_temp = Path(env['RUNNER_TEMP']).resolve(); require(runner_temp.is_dir(), 'Runner temporary directory required')
    if args.operation == 'verify':
        report = json.loads((workspace/'reports'/REPORT_NAME).read_text())
        validate_result(report, context); print('TRIAL_PASS: local network experiment only; replay_authorized=false'); return
    trial = Trial(context, workspace, runner_temp, existing=args.operation == 'cleanup')
    if args.operation == 'run': trial.run()
    else:
        report = json.loads((workspace/'reports'/REPORT_NAME).read_text()) if (workspace/'reports'/REPORT_NAME).exists() else trial.report
        report['cleanup'] = trial.cleanup(); report['finished_at'] = time.time_ns() // 1_000_000
        if report['cleanup']['status'] != 'PASS': report['status'] = 'FAIL'
        trial.report = report; trial.write_report(); require(report['cleanup']['status'] == 'PASS', 'Fallback cleanup failed')


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('TRIAL_FAIL: ' + type(error).__name__ + ': ' + str(error)[:180], file=sys.stderr); sys.exit(1)
