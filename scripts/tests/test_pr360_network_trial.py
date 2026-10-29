"""Offline contract tests only; no Docker, sockets, namespaces, nft or SQL run."""
from __future__ import annotations

import copy
import hashlib
import importlib.util
from pathlib import Path
import re
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


SOURCE = Path(__file__).with_name("pr360-network-trial.py")
SPEC = importlib.util.spec_from_file_location("pr360_network_trial_unit_subject", SOURCE)
TRIAL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = TRIAL
with patch("subprocess.run", side_effect=AssertionError("Import cannot execute commands")), \
     patch("subprocess.Popen", side_effect=AssertionError("Import cannot launch processes")), \
     patch("socket.socket", side_effect=AssertionError("Import cannot create sockets")):
    SPEC.loader.exec_module(TRIAL)


SHA = "a" * 40
NONCE = "11111111-1111-4111-8111-111111111111"


def fixture_env():
    return {
        "CI": "true", "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "RUNNER_OS": "Linux", "RUNNER_ARCH": "X64",
        "GITHUB_REPOSITORY": "hlopezb83/liftgo", "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_JOB": "trial", "PR360_TRIAL_AUTHORIZATION": "local-network-only-v1", "PR360_TRIAL_NONCE": NONCE,
        "GITHUB_SHA": SHA, "PR360_EXPECTED_SHA": SHA, "GITHUB_RUN_ID": "9001",
        "GITHUB_RUN_ATTEMPT": "1", "SUDO_UID": "1001", "SUDO_GID": "1001",
    }


def image_fixture():
    return {
        "Id": "sha256:" + "b" * 64,
        "Config": {"Entrypoint": ["/inert"], "User": "65534:65534", "Labels": {
            "io.liftgo.trial.purpose": "pr360-network-only", "io.liftgo.trial.nonce": NONCE}},
        "RootFS": {"Type": "layers", "Layers": ["sha256:" + "c" * 64]},
    }


def modeled_report():
    """Synthetic data modeling consumer validation, never runtime evidence."""
    context = TRIAL.validate_context(fixture_env(), SHA, 0)
    context["nonce"] = NONCE
    checks = {name: True for name in [
        "local_tcp_positive", "ipv6_positive", "host_gateway_positive", "dns_udp_positive", "dns_tcp_positive",
        "dns_udp_denied", "dns_tcp_denied", "ipv4_denied", "ipv6_denied", "drop_counters_increased", "observers_alive",
    ]}
    observations = []
    for i, name in enumerate(["docker-a", "docker-b", "native"]):
        docker = name.startswith("docker")
        dns_address = "127.0.0.11" if docker else "127.0.0.1"
        counters = {"dns_denied": 0, "other_denied": 0}
        probes = []
        targets = [("dns-udp", dns_address, 53, "dns_denied"),
                   ("dns-tcp", dns_address, 53, "dns_denied"),
                   ("ipv4-loopback", "127.0.0.1", 45678, "other_denied")]
        if docker:
            targets.append(("ipv4-host-gateway", "172.20.0.1", 45679, "other_denied"))
        targets.append(("ipv6-loopback", "::1", 45678, "other_denied"))
        for kind, address, port, counter in targets:
            before = dict(counters)
            counters[counter] += 1
            probes.append({"kind": kind, "address": address, "port": port, "blocked": True,
                           "before": before, "after": dict(counters)})
        observations.append({
            "identity": {"pid": 4200 + i, "start": str(12000 + i), "netns": 4000 + i},
            "network_id": "d" * 64 if docker else None,
            "container_id": str(i + 1) * 64 if docker else None,
            "peer_ipv4": "172.20.0.3" if docker else None,
            "host_gateway": "172.20.0.1" if docker else None,
            "dns_address": dns_address, "dns_expected_A": "172.20.0.2" if docker else "127.0.0.1",
            "before_counters": {"dns_denied": 0, "other_denied": 0}, "after_counters": dict(counters),
            "negative_probes": probes, "positive_probes": {target[0]: True for target in targets},
            "observer_receipts_before": [1, 1, 2], "observer_receipts_after": [1, 1, 2],
            "no_external_interface_or_route": not docker,
        })
    report = {
        "schema_version": 1, "kind": "real", "trial_only": True, "replay_authorized": False,
        "sha": SHA, "run_id": "9001", "attempt": "1", "job": "trial", "nonce": NONCE,
        "started_at": 1000, "finished_at": 9000, "status": "TRIAL_PASS",
        "fixture": {"source_sha256": hashlib.sha256(TRIAL.ASSEMBLY).hexdigest(), "elf_sha256": "e" * 64,
                    "image_id": "sha256:" + "b" * 64,
                    "origin": "runner-local-scratch; no registry or Supabase equivalence claimed"},
        "measurements": [{"context": name, "checks": dict(checks), "namespace_inode": 4000 + i, "observations": observations[i]}
                         for i, name in enumerate(["docker-a", "docker-b", "native"])],
        "cleanup": {"status": "PASS", "ownership_verified": True, "stopped_verified": True,
                    "remaining": {kind: 0 for kind in ["containers", "images", "networks", "workers", "namespaces", "rules"]}},
    }
    return report, context


class ManualContextTests(unittest.TestCase):
    def test_exact_manual_hosted_checkout_context_is_accepted(self):
        result = TRIAL.validate_context(fixture_env(), SHA, 0)
        self.assertEqual(result["sha"], SHA)
        self.assertEqual(result["job"], "trial")
        self.assertEqual(result["runner_uid"], 1001)
        self.assertEqual(result["runner_gid"], 1001)

    def test_every_required_identity_or_authorization_field_is_required(self):
        for key in fixture_env():
            env = fixture_env()
            TRIAL.validate_context(env, SHA, 0)
            del env[key]
            with self.subTest(key=key), self.assertRaises((ValueError, AssertionError)):
                TRIAL.validate_context(env, SHA, 0)

    def test_other_events_repositories_runners_and_jobs_are_not_allowed(self):
        mutations = {
            "CI": "false", "GITHUB_ACTIONS": "false", "RUNNER_ENVIRONMENT": "self-hosted", "RUNNER_OS": "Windows", "RUNNER_ARCH": "ARM64",
            "GITHUB_REPOSITORY": "different/repository", "GITHUB_EVENT_NAME": "pull_request",
            "GITHUB_JOB": "supabase-replay", "PR360_TRIAL_AUTHORIZATION": "approved",
        }
        for key, value in mutations.items():
            env = fixture_env()
            env[key] = value
            with self.subTest(key=key), self.assertRaises((ValueError, AssertionError)):
                TRIAL.validate_context(env, SHA, 0)

    def test_workflow_sha_expected_sha_and_actual_checkout_must_agree(self):
        for key in ["GITHUB_SHA", "PR360_EXPECTED_SHA"]:
            env = fixture_env()
            env[key] = "b" * 40
            with self.subTest(key=key), self.assertRaises((ValueError, AssertionError)):
                TRIAL.validate_context(env, SHA, 0)
        with self.assertRaises((ValueError, AssertionError)):
            TRIAL.validate_context(fixture_env(), "b" * 40, 0)

    def test_nonce_must_be_an_explicit_valid_current_invocation_identity(self):
        self.assertEqual(TRIAL.validate_context(fixture_env(), SHA, 0)["nonce"], NONCE)
        for nonce in ["missing", "11111111-1111-1111-1111-111111111111", "11111111-1111-4111-8111-111111111111\n"]:
            env = fixture_env()
            env["PR360_TRIAL_NONCE"] = nonce
            with self.subTest(nonce=nonce), self.assertRaises((ValueError, AssertionError)):
                TRIAL.validate_context(env, SHA, 0)

    def test_invalid_run_numbers_or_privilege_identity_fail_closed(self):
        for key in ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "SUDO_UID", "SUDO_GID"]:
            for value in ["0", "-1", "text", "1; command"]:
                env = fixture_env()
                env[key] = value
                with self.subTest(key=key, value=value), self.assertRaises((ValueError, AssertionError)):
                    TRIAL.validate_context(env, SHA, 0)
        with self.assertRaises((ValueError, AssertionError)):
            TRIAL.validate_context(fixture_env(), SHA, 1001)


class NamespacePolicyTests(unittest.TestCase):
    def test_policy_is_scoped_to_an_owned_namespace_table(self):
        rules = TRIAL.nft_rules("lg360_a1b2c3d4", "10.88.0.2")
        self.assertIn("lg360_a1b2c3d4", rules)
        self.assertIn("10.88.0.2", rules)
        self.assertNotIn("flush ruleset", rules)
        self.assertNotRegex(rules, r"\b(?:input|forward)\b")

    def test_dns_is_denied_before_any_tcp_allowance(self):
        rules = TRIAL.nft_rules("lg360_a1b2c3d4", "10.88.0.2")
        dns = [m.start() for m in re.finditer(r"dport\s+(?:\{\s*)?53\b", rules)]
        sql = [m.start() for m in re.finditer(r"dport\s+(?:\{\s*)?5432\b", rules)]
        self.assertTrue(dns, "A rule must deny DNS explicitly")
        self.assertTrue(sql, "The intended SQL port must remain available")
        self.assertLess(max(dns), min(sql), "DNS rules precede local/peer allows")
        self.assertRegex(rules, r"priority\s+-300")
        self.assertRegex(rules, r"policy\s+drop")

    def test_policy_does_not_open_loopback_or_existing_connections_globally(self):
        rules = TRIAL.nft_rules("lg360_a1b2c3d4", "10.88.0.2")
        self.assertNotRegex(rules, r"(?m)^\s*ct\s+state\s+(?:\{[^}]*\}|established)\s+accept")
        self.assertNotIn("127.0.0.0/8", rules)
        self.assertNotRegex(rules, r'oifname\s+"lo"\s+accept')
        self.assertNotRegex(rules, r"ip6?\s+daddr\s+(?:127\.0\.0\.1|::1)\s+(?:counter\s+)?accept")

    def test_source_sql_port_is_only_a_scoped_established_response_allowance(self):
        rules = TRIAL.nft_rules("lg360_a1b2c3d4", "10.88.0.2")
        responses = [line for line in rules.splitlines() if re.search(r"tcp\s+sport\s+5432", line)]
        self.assertTrue(responses)
        for line in responses:
            self.assertIn("ct state established", line)
            self.assertRegex(line, r"ip6?\s+daddr\s+(?:127\.0\.0\.1|::1|10\.88\.0\.2)\b")

    def test_unowned_table_names_are_rejected(self):
        for table in ["filter", "lg360_123", "lg360_123456789", "lg360_abcdefgh", "lg360_a1b2c3d4; flush ruleset", "lg360_a1b2c3d4\n"]:
            with self.subTest(table=table), self.assertRaises((ValueError, AssertionError)):
                TRIAL.nft_rules(table, "10.88.0.2")

    def test_peer_addresses_cannot_target_public_host_or_metadata_destinations(self):
        for peer in ["8.8.8.8", "127.0.0.1", "169.254.169.254", "0.0.0.0", "10.88.0.0/24", "10.88.0.2\naccept", "::1"]:
            with self.subTest(peer=peer), self.assertRaises((ValueError, AssertionError)):
                TRIAL.nft_rules("lg360_a1b2c3d4", peer)


class NamespaceDescriptorPinTests(unittest.TestCase):
    def fixture(self):
        trial = object.__new__(TRIAL.Trial)
        trial.host_ns = 100
        trial.namespace_fds = {}
        trial.command = Mock(side_effect=AssertionError("Constructing a namespace prefix cannot execute nsenter"))
        return trial, {"pid": 4242, "start": "12345", "netns": 200}

    def test_namespace_fd_is_pinned_reused_and_passed_by_supervisor_fd_path(self):
        trial, identity = self.fixture()
        with patch.object(TRIAL, "pid_identity", return_value=identity), \
             patch.object(TRIAL, "same_pid", return_value=True), \
             patch.object(TRIAL.os, "stat", return_value=SimpleNamespace(st_ino=100)), \
             patch.object(TRIAL.os, "open", return_value=91) as opened, \
             patch.object(TRIAL.os, "fstat", return_value=SimpleNamespace(st_ino=200)), \
             patch.object(TRIAL.os, "close") as closed, \
             patch.object(TRIAL.os, "getpid", return_value=777):
            expected = ["/usr/bin/nsenter", "--net=/proc/777/fd/91", "--"]
            self.assertEqual(trial.namespace(identity), expected)
            self.assertEqual(trial.namespace(identity), expected)
            opened.assert_called_once_with("/proc/4242/ns/net", TRIAL.os.O_RDONLY | TRIAL.os.O_CLOEXEC)
            closed.assert_not_called()
            self.assertEqual(trial.namespace_fds, {200: 91})
            trial.command.assert_not_called()

    def test_host_namespace_is_rejected_before_open_or_nsenter(self):
        trial, identity = self.fixture()
        with patch.object(TRIAL, "same_pid", return_value=True), \
             patch.object(TRIAL.os, "stat", return_value=SimpleNamespace(st_ino=200)), \
             patch.object(TRIAL.os, "open") as opened:
            with self.assertRaises(ValueError):
                trial.namespace(identity)
            opened.assert_not_called()
            trial.command.assert_not_called()

    def test_stale_pid_is_rejected_before_open_or_nsenter(self):
        trial, identity = self.fixture()
        with patch.object(TRIAL, "same_pid", return_value=False), patch.object(TRIAL.os, "open") as opened:
            with self.assertRaises(ValueError):
                trial.namespace(identity)
            opened.assert_not_called()
            trial.command.assert_not_called()

    def test_inode_mismatch_after_open_closes_the_fd_and_cannot_release_prefix(self):
        trial, identity = self.fixture()
        with patch.object(TRIAL, "same_pid", return_value=True), \
             patch.object(TRIAL.os, "stat", return_value=SimpleNamespace(st_ino=100)), \
             patch.object(TRIAL.os, "open", return_value=91), \
             patch.object(TRIAL.os, "fstat", return_value=SimpleNamespace(st_ino=201)), \
             patch.object(TRIAL.os, "close") as closed:
            with self.assertRaises(ValueError):
                trial.namespace(identity)
            closed.assert_called_once_with(91)
            self.assertEqual(trial.namespace_fds, {})
            trial.command.assert_not_called()

    def test_pid_reuse_while_opening_namespace_closes_fd_before_nsenter(self):
        trial, identity = self.fixture()
        with patch.object(TRIAL, "same_pid", side_effect=[True, False]), \
             patch.object(TRIAL.os, "stat", return_value=SimpleNamespace(st_ino=100)), \
             patch.object(TRIAL.os, "open", return_value=91), \
             patch.object(TRIAL.os, "fstat", return_value=SimpleNamespace(st_ino=200)), \
             patch.object(TRIAL.os, "close") as closed:
            with self.assertRaises(ValueError):
                trial.namespace(identity)
            closed.assert_called_once_with(91)
            self.assertEqual(trial.namespace_fds, {})
            trial.command.assert_not_called()

    def test_reused_cached_descriptor_must_still_identify_the_expected_nonhost_namespace(self):
        trial, identity = self.fixture()
        trial.namespace_fds[200] = 91
        for inode in [100, 201]:
            with self.subTest(inode=inode), patch.object(TRIAL, "same_pid", return_value=True), \
                 patch.object(TRIAL.os, "stat", return_value=SimpleNamespace(st_ino=100)), \
                 patch.object(TRIAL.os, "open") as opened, \
                 patch.object(TRIAL.os, "fstat", return_value=SimpleNamespace(st_ino=inode)):
                with self.assertRaises(ValueError):
                    trial.namespace(identity)
                opened.assert_not_called()
                trial.command.assert_not_called()


class InertImageTests(unittest.TestCase):
    def assert_bad_image(self, mutate):
        info = image_fixture()
        TRIAL.validate_image_metadata(info, info["Id"], NONCE)
        mutate(info)
        with self.assertRaises((ValueError, AssertionError)):
            TRIAL.validate_image_metadata(info, image_fixture()["Id"], NONCE)

    def test_only_the_locally_created_inert_image_identity_is_accepted(self):
        info = image_fixture()
        TRIAL.validate_image_metadata(info, info["Id"], NONCE)

    def test_image_id_entrypoint_user_and_ownership_labels_cannot_change(self):
        mutations = [
            lambda i: i.update(Id="sha256:" + "d" * 64),
            lambda i: i["Config"].update(Entrypoint=["postgres"]),
            lambda i: i["Config"].update(User="root"),
            lambda i: i["Config"]["Labels"].update({"io.liftgo.trial.purpose": "replay"}),
            lambda i: i["Config"]["Labels"].update({"io.liftgo.trial.nonce": "other"}),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutations.index(mutate)):
                self.assert_bad_image(mutate)

    def test_image_cannot_smuggle_commands_environment_build_hooks_or_volumes(self):
        for field, value in [("Cmd", ["sh"]), ("Env", ["VARIABLE=fixture"]),
                             ("OnBuild", ["RUN command"]), ("Volumes", {"/data": {}})]:
            with self.subTest(field=field):
                self.assert_bad_image(lambda i, field=field, value=value: i["Config"].update({field: value}))

    def test_missing_or_unmodeled_rootfs_is_rejected(self):
        for value in [{}, {"Type": "other", "Layers": []}, {"Type": "layers", "Layers": []}]:
            with self.subTest(rootfs=value):
                self.assert_bad_image(lambda i, value=value: i.update(RootFS=value))


class ResultConsumerTests(unittest.TestCase):
    def reject_mutation(self, mutate):
        report, context = modeled_report()
        self.assertEqual(TRIAL.validate_result(report, context), "TRIAL_PASS",
                         "Each negative control starts with coherent synthetic data")
        mutate(report, context)
        with self.assertRaises((ValueError, AssertionError)):
            TRIAL.validate_result(report, context)

    def test_synthetic_consumer_model_does_not_authorize_a_replay(self):
        report, context = modeled_report()
        self.assertEqual(TRIAL.validate_result(report, context), "TRIAL_PASS")
        self.assertTrue(report["trial_only"])
        self.assertFalse(report["replay_authorized"])

    def test_fixture_or_general_replay_reports_are_rejected(self):
        for field, value in [("kind", "fixture"), ("trial_only", False), ("replay_authorized", True),
                             ("schema_version", 2), ("status", "PASS")]:
            with self.subTest(field=field):
                self.reject_mutation(lambda r, c, field=field, value=value: r.update({field: value}))

    def test_report_must_match_the_current_sha_run_attempt_and_producer(self):
        for field, value in [("sha", "b" * 40), ("run_id", "9000"), ("attempt", "2"), ("job", "supabase-replay")]:
            with self.subTest(field=field):
                self.reject_mutation(lambda r, c, field=field, value=value: r.update({field: value}))

    def test_report_requires_a_valid_nonce_and_ordered_timestamps(self):
        for mutate in [lambda r, c: r.update(nonce="missing"),
                       lambda r, c: r.update(nonce="22222222-2222-4222-8222-222222222222"),
                       lambda r, c: r.update(started_at=0),
                       lambda r, c: r.update(finished_at=r["started_at"] - 1)]:
            self.reject_mutation(mutate)

    def test_all_three_execution_contexts_are_required_exactly_once(self):
        self.reject_mutation(lambda r, c: r["measurements"].pop())
        self.reject_mutation(lambda r, c: r["measurements"].append(copy.deepcopy(r["measurements"][0])))
        self.reject_mutation(lambda r, c: r["measurements"][0].update(context="unmodeled"))

    def test_every_positive_negative_and_observer_check_is_mandatory(self):
        report, _ = modeled_report()
        for index, item in enumerate(report["measurements"]):
            for name in item["checks"]:
                for value in [False, None, 1, "true"]:
                    with self.subTest(context=index, check=name, value=value):
                        self.reject_mutation(lambda r, c, index=index, name=name, value=value:
                                             r["measurements"][index]["checks"].update({name: value}))

    def test_missing_dns_or_drop_counter_observation_never_means_success(self):
        for name in ["dns_udp_positive", "dns_tcp_positive", "dns_udp_denied", "dns_tcp_denied", "drop_counters_increased"]:
            self.reject_mutation(lambda r, c, name=name: r["measurements"][0]["checks"].pop(name))

    def test_namespace_identity_must_be_observed(self):
        for value in [0, -1, "4000", None, True]:
            self.reject_mutation(lambda r, c, value=value: r["measurements"][0].update(namespace_inode=value))

    def test_execution_contexts_cannot_share_a_namespace(self):
        self.reject_mutation(lambda r, c: r["measurements"][1].update(namespace_inode=r["measurements"][0]["namespace_inode"]))

    def test_boolean_success_without_causal_raw_observations_is_not_measurement(self):
        for i in range(3):
            self.reject_mutation(lambda r, c, i=i: r["measurements"][i].pop("observations"))
        self.reject_mutation(lambda r, c: r.pop("fixture"))

    def test_raw_namespace_and_local_fixture_provenance_must_match(self):
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"]["identity"].update(netns=9999))
        self.reject_mutation(lambda r, c: r["fixture"].update(source_sha256="f" * 64))
        self.reject_mutation(lambda r, c: r["fixture"].update(origin="ghcr.io/supabase"))
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"].update(container_id=None))

    def test_each_negative_probe_requires_its_own_counter_increase(self):
        for i in range(3):
            probes = modeled_report()[0]["measurements"][i]["observations"]["negative_probes"]
            for p in range(len(probes)):
                self.reject_mutation(lambda r, c, i=i, p=p: r["measurements"][i]["observations"]["negative_probes"][p].update(
                    after=dict(r["measurements"][i]["observations"]["negative_probes"][p]["before"])))

    def test_probe_targets_and_positive_controls_cannot_be_replaced_or_omitted(self):
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"]["negative_probes"][0].update(address="8.8.8.8"))
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"]["negative_probes"].pop())
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"]["positive_probes"].update({"dns-tcp": False}))
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"]["negative_probes"][0].update(blocked=False))
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"].update(dns_address="127.0.0.1"))

    def test_observer_receipts_and_native_route_checks_are_independent_evidence(self):
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"].update(observer_receipts_after=[1, 2, 2]))
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"].update(observer_receipts_before=[]))
        self.reject_mutation(lambda r, c: r["measurements"][2]["observations"].update(no_external_interface_or_route=False))

    def test_raw_counter_totals_cannot_hide_missing_negative_measurements(self):
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"].update(after_counters={"dns_denied": 0, "other_denied": 0}))
        self.reject_mutation(lambda r, c: r["measurements"][0]["observations"]["negative_probes"][1].update(before={"dns_denied": 0, "other_denied": 0}))

    def test_cleanup_failure_or_unproven_ownership_blocks(self):
        self.reject_mutation(lambda r, c: r["cleanup"].update(status="FAIL"))
        self.reject_mutation(lambda r, c: r["cleanup"].update(ownership_verified=False))
        self.reject_mutation(lambda r, c: r["cleanup"].update(stopped_verified=False))
        self.reject_mutation(lambda r, c: r["cleanup"].pop("stopped_verified"))
        self.reject_mutation(lambda r, c: r.pop("cleanup"))

    def test_cleanup_must_cover_all_owned_resource_types_with_zero_remaining(self):
        report, _ = modeled_report()
        for name in report["cleanup"]["remaining"]:
            self.reject_mutation(lambda r, c, name=name: r["cleanup"]["remaining"].update({name: 1}))
            self.reject_mutation(lambda r, c, name=name: r["cleanup"]["remaining"].pop(name))
            self.reject_mutation(lambda r, c, name=name: r["cleanup"]["remaining"].update({name: False}))


class ManualWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = SOURCE.parents[2] / ".github/workflows/pr360-network-trial.yml"
        cls.text = path.read_text()
        cls.active = "\n".join(line for line in cls.text.splitlines() if not line.lstrip().startswith("#"))

    def test_the_only_trigger_is_explicit_workflow_dispatch(self):
        trigger = re.search(r"^on:\n(.*?)^permissions:", self.active, re.M | re.S)
        self.assertIsNotNone(trigger)
        self.assertEqual(re.findall(r"^  ([a-z_]+):", trigger.group(1), re.M), ["workflow_dispatch"])
        for event in ["push", "pull_request", "workflow_call", "pull_request_target", "workflow_run", "repository_dispatch", "schedule"]:
            self.assertNotRegex(trigger.group(1), rf"^  {event}:")

    def test_dispatch_binds_exact_sha_and_the_narrow_authorization_literal(self):
        self.assertRegex(self.active, r"expected_sha:\n\s+description:[^\n]+\n\s+required: true\n\s+type: string")
        self.assertIn("local-network-only-v1", self.active)
        self.assertIn("PR360_EXPECTED_SHA: ${{ inputs.expected_sha }}", self.active)
        self.assertIn("PR360_TRIAL_AUTHORIZATION: ${{ inputs.authorization }}", self.active)
        self.assertIn("ref: ${{ inputs.expected_sha }}", self.active)
        self.assertIn("assert os.environ['GITHUB_SHA']==expected", self.active)
        self.assertIn("assert os.environ['GITHUB_EVENT_NAME']=='workflow_dispatch'", self.active)
        for name in ["PR360_TRIAL_NONCE", "RUNNER_OS", "RUNNER_ARCH"]:
            for preserve_line in re.findall(r"sudo --preserve-env=([^\n]+)", self.active):
                self.assertIn(name, preserve_line.split("\\", 1)[0].strip().split(","))

    def test_permissions_are_readonly_and_checkout_does_not_persist_credentials(self):
        permission = re.search(r"^permissions:\n(.*?)^concurrency:", self.active, re.M | re.S)
        self.assertIsNotNone(permission)
        self.assertEqual(permission.group(1).strip(), "contents: read")
        self.assertIn("persist-credentials: false", self.active)
        self.assertNotIn("secrets.", self.active)
        self.assertNotRegex(self.active, r"\bid-token\s*:")

    def test_trial_is_single_job_with_total_budget_and_no_general_ci_or_erp_execution(self):
        job = re.search(r"^jobs:\n(.*)", self.active, re.M | re.S)
        self.assertIsNotNone(job)
        self.assertEqual(re.findall(r"^  ([a-zA-Z0-9_-]+):", job.group(1), re.M), ["trial"])
        self.assertRegex(job.group(1), re.compile(r"^    timeout-minutes: 15$", re.M))
        step_budgets = [int(value) for value in re.findall(r"^        timeout-minutes: ([0-9]+)$", self.active, re.M)]
        self.assertEqual(len(step_budgets), len(re.findall(r"^      - ", self.active, re.M)))
        self.assertLessEqual(sum(step_budgets), 14)
        self.assertNotRegex(self.active, r"uses:\s*\./\.github/workflows/")
        self.assertNotRegex(self.active, r"\b(?:supabase\s+start|migration\s+up|psql|drizzle-kit|playwright|wrangler|bunx)\b")
        self.assertNotIn("scripts/ci-pr357-", self.active)
        self.assertNotIn("scripts/ci_database.py", self.active)

    def test_cleanup_verification_and_safe_metadata_upload_remain_mandatory(self):
        for name in ["Verify or finish owned cleanup", "Verify terminal infrastructure-only evidence", "Upload safe trial and cleanup metadata"]:
            block = re.search(r"      - name: " + re.escape(name) + r"\n(.*?)(?=\n      - |\Z)", self.active, re.S)
            self.assertIsNotNone(block)
            self.assertIn("if: always()", block.group(1))
        self.assertIn("path: reports/pr360-network-trial.json", self.active)
        self.assertIn("if-no-files-found: error", self.active)


if __name__ == "__main__":
    unittest.main()
