#!/usr/bin/env python
"""Local web dashboard for the campus Determined cluster.

Serves a single-page dashboard on localhost that polls read-only cluster
information: resource pools, agent GPU slots, the current account's tasks,
per-task details, live logs, an in-container environment view for
interactive shells, and a
double-confirmed kill action. Credentials never leave this process; the
server binds to 127.0.0.1 by default.

Run directly (``python3 det_web.py``) or through ``det_cluster.py web``.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Allow running both as a module sibling of det_cluster.py and standalone.
SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import det_cluster  # noqa: E402

DEFAULT_PORT = 8686
ACTIVE_STATES = {"RUNNING", "PULLING", "STARTING", "SCHEDULED", "QUEUED", "ASSIGNED", "ACTIVE"}
TERMINAL_STATES = {"TERMINATED", "COMPLETED", "ERROR", "CANCELLED", "DELETED"}

# ---------------------------------------------------------------------------
# Session handling
# ---------------------------------------------------------------------------


class Dashboard:
    """Cached Determined session plus all data gatherers for the dashboard."""

    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self._lock = threading.Lock()
        self._session = None
        self._master = None
        self._username = None

    # -- session -----------------------------------------------------------

    def session(self):
        with self._lock:
            if self._session is None:
                sess, creds, master = det_cluster.login_session(self.args)
                self._session = sess
                self._master = master
                self._username = creds["username"]
            return self._session, self._master, self._username

    def reset_session(self) -> None:
        with self._lock:
            self._session = None
            self._master = None
            self._username = None

    def call(self, fn):
        """Run fn(sess) once, retrying a single time after re-login."""
        try:
            sess, master, username = self.session()
            return fn(sess), master, username
        except Exception as exc:
            message = str(exc)
            if any(word in message.lower() for word in ("401", "unauthorized", "auth")):
                self.reset_session()
                sess, master, username = self.session()
                return fn(sess), master, username
            raise


def _bindings():
    from determined.common.api import bindings

    return bindings


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------


def _clean_state(state) -> str:
    text = str(state or "")
    return text[6:] if text.startswith("STATE_") else text


def _pick(record: dict, *keys):
    for key in keys:
        value = record.get(key)
        if value is not None:
            return value
    return None


_SENSITIVE_RAW_KEYS = {
    "privatekey",
    "sshprivatekey",
    "password",
    "token",
    "accesstoken",
    "refreshtoken",
    "secret",
    "clientsecret",
}


def _redact_sensitive(value):
    """Remove credentials before task details are sent to the browser."""
    if isinstance(value, dict):
        safe = {}
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if normalized in _SENSITIVE_RAW_KEYS:
                continue
            safe[key] = _redact_sensitive(item)
        return safe
    if isinstance(value, list):
        return [_redact_sensitive(item) for item in value]
    return value


def _normalize_task(kind: str, record: dict) -> dict:
    if kind == "experiment":
        item = {
            "id": str(record.get("id", "")),
            "kind": kind,
            "description": _pick(record, "description", "displayName", "name") or "",
            "state": _clean_state(record.get("state")),
            "startTime": record.get("startTime"),
            "endTime": record.get("endTime"),
            "user": record.get("username"),
            "jobId": record.get("jobId"),
            "pool": record.get("resourcePool"),
            "progress": record.get("progress"),
            "numTrials": record.get("numTrials"),
        }
    else:
        item = {
            "id": record.get("id") or "",
            "kind": kind,
            "description": _pick(record, "description", "displayName") or "",
            "state": _clean_state(record.get("state")),
            "startTime": record.get("startTime"),
            "endTime": record.get("endTime"),
            "user": record.get("username"),
            "jobId": record.get("jobId"),
            "pool": record.get("resourcePool"),
            "exitStatus": record.get("exitStatus"),
        }
    item["active"] = item["state"] in ACTIVE_STATES
    return item


def _plural(kind: str) -> str:
    return {"command": "commands", "shell": "shells"}.get(kind, kind + "s")


# ---------------------------------------------------------------------------
# Data gatherers
# ---------------------------------------------------------------------------


def _cluster_info(sess) -> dict:
    try:
        info = sess.get("info").json()
        return {
            "name": info.get("cluster_name") or "unknown",
            "version": info.get("version") or "unknown",
        }
    except Exception:
        return {"name": "unknown", "version": "unknown"}


def _pools(sess) -> list:
    pools = sess.get("api/v1/resource-pools").json().get("resourcePools", [])
    result = []
    for pool in pools:
        stats = pool.get("stats") or {}
        used = pool.get("slotsUsed") or 0
        available = pool.get("slotsAvailable") or 0
        result.append(
            {
                "name": pool.get("name") or "",
                "description": pool.get("description") or "",
                "numAgents": pool.get("numAgents") or 0,
                "slotsUsed": used,
                "slotsAvailable": available,
                "slotsTotal": used + available,
                "queued": stats.get("queuedCount") or 0,
            }
        )
    return result


def _reconcile_pool_totals(pools: list, agents: list) -> None:
    """Override pool slot numbers with the agents' actual slot inventory.

    The Master's resource-pools accounting can disagree with reality (for
    example it may keep counting slots of a disconnected agent), so the
    per-slot data from the agents API is treated as the source of truth.
    Queue depth still comes from the resource-pools API.
    """
    truth: dict = {}
    for agent in agents:
        for pool_name in agent.get("pools") or []:
            agg = truth.setdefault(pool_name, {"total": 0, "free": 0, "agents": 0})
            agg["agents"] += 1
            for slot in agent.get("slots") or []:
                agg["total"] += 1
                if slot.get("state") == "free":
                    agg["free"] += 1
    for pool in pools:
        actual = truth.pop(pool["name"], None)
        if not actual:
            # No connected agent backs this pool; report zero real capacity.
            pool["slotsTotal"] = 0
            pool["slotsUsed"] = 0
            pool["slotsAvailable"] = 0
            continue
        pool["slotsTotal"] = actual["total"]
        pool["slotsFree"] = actual["free"]
        pool["slotsUsed"] = actual["total"] - actual["free"]
        pool["slotsAvailable"] = actual["free"]
        pool["numAgents"] = actual["agents"]


def _agents_with_slots(sess) -> list:
    bindings = _bindings()
    task_res = bindings.get_GetTasks(sess)
    agents = bindings.get_GetAgents(sess).agents or []

    by_container = {}
    for allocation in (task_res.allocationIdToSummary or {}).values():
        for resource in allocation.resources or []:
            container_id = getattr(resource, "containerId", None)
            if container_id:
                by_container[container_id] = {
                    "name": getattr(allocation, "name", None),
                    "taskId": getattr(allocation, "taskId", None),
                    "allocationId": getattr(allocation, "allocationId", None),
                    "pool": getattr(allocation, "resourcePool", None),
                }

    result = []
    for agent in agents:
        slots = []
        for slot_id, slot in sorted((agent.slots or {}).items()):
            short_slot_id = str(slot_id).split("/")[-1]
            container = slot.container
            if str(slot.device.type) == 'TYPE_CPU':
                continue
            if not container:
                enabled = agent.enabled and not getattr(agent, 'draining', False) and slot.enabled and not getattr(slot, 'draining', False)
                slots.append({"id": short_slot_id, "state": "free" if enabled else "disabled"})
                continue
            info = by_container.get(container.id, {})
            slots.append(
                {
                    "id": short_slot_id,
                    "state": "busy",
                    "containerId": container.id,
                    "user": info.get("name") or "UNKNOWN",
                    "taskId": info.get("taskId"),
                    "pool": info.get("pool"),
                }
            )
        addresses = []
        for address in agent.addresses or []:
            value = getattr(address, "address", None) or getattr(address, "hostIp", None)
            addresses.append(str(value) if value else str(address))
        result.append(
            {
                "id": agent.id.split("/")[-1],
                "pools": list(agent.resourcePools or []),
                "enabled": bool(agent.enabled),
                "draining": bool(getattr(agent, "draining", False)),
                "addresses": addresses,
                "slotsTotal": len(slots),
                "slotsFree": sum(1 for slot in slots if slot["state"] == "free"),
                "slots": slots,
            }
        )
    return result


def _list_tasks(sess, kind: str, scope: str) -> list:
    if kind in ("command", "shell"):
        params = {}
        if scope != "all":
            _, _, username = dashboard.session()
            params["users"] = [username]
        payload = sess.get(f"api/v1/{_plural(kind)}", params=params).json()
        records = payload.get(_plural(kind), []) or []
        return [_normalize_task(kind, record) for record in records]
    if kind == "experiment":
        bindings = _bindings()
        kwargs = {"limit": 100}
        if scope != "all":
            _, _, username = dashboard.session()
            kwargs["users"] = [username]
        response = bindings.get_GetExperiments(sess, **kwargs)
        records = getattr(response, "experiments", None) or []
        items = []
        for record in records:
            data = record.to_json() if hasattr(record, "to_json") else dict(record)
            items.append(_normalize_task("experiment", data))
        return items
    raise ValueError(f"unknown task kind: {kind}")


def _task_detail(sess, kind: str, task_id: str) -> dict:
    if kind in ("command", "shell"):
        payload = sess.get(f"api/v1/{_plural(kind)}/{task_id}").json()
        record = payload.get(kind) or {}
        detail = _normalize_task(kind, record)
        detail["raw"] = _redact_sensitive(record)
        if kind == "shell":
            detail["addresses"] = [
                {
                    "hostIp": _pick(item, "hostIp", "host_ip"),
                    "hostPort": _pick(item, "hostPort", "host_port"),
                    "containerPort": _pick(item, "containerPort", "container_port"),
                }
                for item in (record.get("addresses") or [])
                if isinstance(item, dict)
            ]
        try:
            bindings = _bindings()
            config_text = bindings.get_GetGenericTaskConfig(sess, taskId=task_id).config
            detail["configYaml"] = config_text
            detail["configSummary"] = _summarize_config(config_text)
        except Exception:
            pass
        return detail
    if kind == "experiment":
        payload = sess.get(f"api/v1/experiments/{task_id}").json()
        record = payload.get("experiment") or {}
        detail = _normalize_task("experiment", record)
        detail["raw"] = _redact_sensitive(
            {key: value for key, value in record.items() if key != "config"}
        )
        original = record.get("originalConfig")
        if isinstance(original, str) and original.strip():
            detail["configYaml"] = original
            detail["configSummary"] = _summarize_config(original)
        return detail
    raise ValueError(f"unknown task kind: {kind}")


def _summarize_config(config_text: str) -> dict:
    """Pull the fields developers ask about first out of a task config YAML."""
    summary: dict = {}
    try:
        import yaml

        config = yaml.safe_load(config_text)
        if not isinstance(config, dict):
            return summary
        resources = config.get("resources") or {}
        environment = config.get("environment") or {}
        summary["image"] = environment.get("image")
        summary["pool"] = resources.get("resource_pool")
        summary["slots"] = resources.get("slots")
        summary["shmSize"] = resources.get("shm_size")
        summary["forcePull"] = environment.get("force_pull_image")
        mounts = []
        for mount in config.get("bind_mounts") or []:
            if isinstance(mount, dict):
                mounts.append(
                    {
                        "hostPath": mount.get("host_path"),
                        "containerPath": mount.get("container_path"),
                        "readOnly": bool(mount.get("read_only")),
                    }
                )
        summary["bindMounts"] = mounts
        variables = environment.get("environment_variables")
        if isinstance(variables, list):
            pairs = []
            for entry in variables:
                if isinstance(entry, str) and "=" in entry:
                    key, _, value = entry.partition("=")
                    pairs.append({"name": key, "value": value})
            summary["environmentVariables"] = pairs
        elif isinstance(variables, dict):
            summary["environmentVariables"] = [
                {"name": key, "value": value} for key, value in variables.items()
            ]
    except Exception:
        pass
    return {key: value for key, value in summary.items() if value not in (None, [], "")}


def _log_entry(response) -> dict:
    data = response.to_json() if hasattr(response, "to_json") else dict(response)
    log_id = data.get("id")
    try:
        log_id = int(log_id)
    except (TypeError, ValueError):
        pass
    level = data.get("level")
    if isinstance(level, str):
        level = level.removeprefix("LOG_LEVEL_").lower()
    return {
        "id": log_id,
        "ts": data.get("timestamp"),
        "level": level,
        "source": data.get("source"),
        "stdtype": data.get("stdtype"),
        "msg": data.get("log") or data.get("message") or "",
    }


def _latest_trial_id(sess, experiment_id: str):
    payload = sess.get(f"api/v1/experiments/{experiment_id}/trials").json()
    trials = payload.get("trials") or []
    if not trials:
        return None
    return max(trials, key=lambda trial: trial.get("id", 0)).get("id")


def _fetch_logs(sess, kind: str, task_id: str, limit: int, after_id) -> tuple:
    from determined.common import api

    entries = []
    trial_id = None
    if kind == "experiment":
        trial_id = _latest_trial_id(sess, task_id)
        if trial_id is None:
            return entries, None
        bindings = _bindings()
        response = bindings.get_TrialLogs(
            sess, trialId=trial_id, limit=limit, orderBy=_bindings().v1OrderBy.DESC
        )
        logs = [entry for entry in response]
        logs.reverse()
    else:
        logs = list(api.task_logs(sess, task_id, tail=limit))
    for log in logs:
        entry = _log_entry(log)
        if after_id is not None and entry["id"] is not None and entry["id"] <= after_id:
            continue
        entries.append(entry)
    return entries, trial_id


def _task_state(sess, kind: str, task_id: str) -> str:
    for scope in ("mine", "all"):
        for item in _list_tasks(sess, kind, scope):
            if item["id"] == task_id:
                return item["state"]
    return "UNKNOWN"


# ---------------------------------------------------------------------------
# In-container live metrics (interactive shells)
# ---------------------------------------------------------------------------

# One SSH round trip returns every metric the dashboard charts. Sections are
# separated by "---" lines: GPU csv rows, RAM bytes, loadavg, disk use%.
METRICS_REMOTE = (
    "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,"
    "temperature.gpu,power.draw --format=csv,noheader,nounits 2>/dev/null; "
    "echo ---; free -b | awk 'NR==2{print $2,$3}'; "
    "echo ---; cat /proc/loadavg; "
    "echo ---; df -Pk / | tail -1 | awk '{print $5}'; "
    "echo ---; df -Pk /mnt/dataset 2>/dev/null | tail -1 | awk '{print $5}'"
)


def _shell_ssh_parts(task_id: str) -> list:
    """Build the ssh invocation for a shell via the Determined CLI.

    The CLI prepares a per-task key in the user cache and prints an ssh
    command tunneled through the master; reuse it so key handling and
    platform differences match the cluster exactly.
    """
    cmd, env = det_cluster.cli_invocation(
        dashboard.args, ["shell", "show_ssh_command", task_id]
    )
    result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=45)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "").strip() or "无法生成 SSH 命令")
    match = re.search(r"^ssh\b.*$", result.stdout or "", re.M)
    if not match:
        raise RuntimeError("未能从 CLI 输出解析 SSH 命令")
    parts = _split_command_line(match.group(0))
    if not parts:
        raise RuntimeError("Determined CLI 返回了空的 SSH 命令")
    ssh_program = parts[0]
    if not shutil.which(ssh_program) and not pathlib.Path(ssh_program).is_file():
        if sys.platform == "win32":
            raise RuntimeError("未找到 OpenSSH 客户端；请启用 Windows OpenSSH Client 后重试")
        raise RuntimeError("未找到 ssh 客户端；请先安装 OpenSSH")
    # "-tt" forces a TTY which breaks running a single remote command; drop it.
    return [part for part in parts if part != "-tt"]


def _split_command_line(command: str) -> list[str]:
    """Split a generated SSH command using the local platform's quoting rules."""
    if sys.platform != "win32":
        return shlex.split(command)

    import ctypes
    from ctypes import wintypes

    argc = ctypes.c_int()
    command_line_to_argv = ctypes.windll.shell32.CommandLineToArgvW
    command_line_to_argv.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_int)]
    command_line_to_argv.restype = ctypes.POINTER(wintypes.LPWSTR)
    argv = command_line_to_argv(command, ctypes.byref(argc))
    if not argv:
        raise OSError(ctypes.get_last_error(), "CommandLineToArgvW failed")
    try:
        return [argv[index] for index in range(argc.value)]
    finally:
        local_free = ctypes.windll.kernel32.LocalFree
        local_free.argtypes = [ctypes.c_void_p]
        local_free.restype = ctypes.c_void_p
        local_free(ctypes.cast(argv, ctypes.c_void_p))


def _num(value) -> float:
    """Parse a possibly 'N/A' nvidia-smi field into a float (0.0 when absent)."""
    try:
        return float(str(value).strip().rstrip("%").strip("[] "))
    except (TypeError, ValueError):
        return 0.0


def parse_metrics(output: str) -> dict:
    parts = output.split("---")
    gpus = []
    for line in (parts[0] if parts else "").strip().splitlines():
        fields = [f.strip() for f in line.split(",")]
        if len(fields) == 5:
            util, mem_used, mem_total, temp, power = (_num(f) for f in fields)
            gpus.append(
                {
                    "util": util,
                    "memUsed": mem_used,
                    "memTotal": mem_total,
                    "temp": temp,
                    "power": power,
                }
            )
    agg = None
    if gpus:
        agg = {
            "count": len(gpus),
            "util": max(g["util"] for g in gpus),
            "memUsed": sum(g["memUsed"] for g in gpus),
            "memTotal": sum(g["memTotal"] for g in gpus),
            "temp": max(g["temp"] for g in gpus),
            "power": sum(g["power"] for g in gpus),
        }

    ram = None
    if len(parts) > 1:
        fields = parts[1].split()
        if len(fields) >= 2:
            try:
                ram = {"total": int(fields[0]), "used": int(fields[1])}
            except ValueError:
                ram = None

    load = None
    if len(parts) > 2:
        fields = parts[2].split()
        try:
            load = [float(fields[0]), float(fields[1]), float(fields[2])]
        except (IndexError, ValueError):
            load = None

    disk = {}
    for key, index in (("root", 3), ("data", 4)):
        if len(parts) > index:
            match = re.search(r"\d+", parts[index])
            if match:
                disk[key] = int(match.group())

    return {"gpus": gpus, "agg": agg, "ram": ram, "load": load, "disk": disk}


def shell_metrics(task_id: str) -> dict:
    """One SSH round trip; structured metrics from inside the user's container."""
    proc = subprocess.run(
        _shell_ssh_parts(task_id) + [METRICS_REMOTE],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError((proc.stderr or "").strip()[:300] or "容器内采样失败")
    data = parse_metrics(proc.stdout or "")
    data["taskId"] = task_id
    data["ts"] = time.time()
    return data


# ---------------------------------------------------------------------------
# Read-only tmux view (interactive shells)
# ---------------------------------------------------------------------------

TMUX_PANES_FORMAT = "|MYLAB|".join(
    [
        "#{session_id}",
        "#{session_name}",
        "#{session_attached}",
        "#{session_windows}",
        "#{window_id}",
        "#{window_index}",
        "#{window_name}",
        "#{window_active}",
        "#{pane_id}",
        "#{pane_index}",
        "#{pane_active}",
        "#{pane_current_command}",
        "#{pane_title}",
        "#{pane_width}",
        "#{pane_height}",
        "#{pane_pid}",
    ]
)


def _run_shell_remote(task_id: str, command: str, timeout: int = 30) -> str:
    proc = subprocess.run(
        _shell_ssh_parts(task_id) + [command],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        message = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(message[:300] or "容器内命令执行失败")
    return proc.stdout or ""


def _tmux_int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _tmux_bool(value) -> bool:
    return str(value).strip().lower() in {"1", "on", "yes", "true"}


def tmux_snapshot(task_id: str, params: dict) -> dict:
    """Return tmux topology and an optional read-only pane snapshot."""
    pane_id = str(params.get("pane") or "").strip()
    if pane_id and not re.fullmatch(r"%\d+", pane_id):
        raise ValueError("无效的 tmux pane ID")
    try:
        lines = min(max(int(params.get("lines", 200)), 20), 1000)
    except (TypeError, ValueError):
        lines = 200

    presence = subprocess.run(
        _shell_ssh_parts(task_id)
        + [
            "if command -v tmux >/dev/null 2>&1; then "
            "printf '__TMUX_PRESENT__'; "
            "else printf '__TMUX_MISSING__'; fi"
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if presence.returncode != 0:
        message = (presence.stderr or presence.stdout or "").strip()
        raise RuntimeError(message[:300] or "无法连接到 Shell 容器")
    if "__TMUX_PRESENT__" not in (presence.stdout or ""):
        return {
            "taskId": task_id,
            "available": False,
            "reason": "容器中未安装 tmux",
            "sessions": [],
            "selectedPane": None,
            "content": None,
            "lines": lines,
            "ts": time.time(),
        }

    list_command = f"tmux list-panes -a -F {shlex.quote(TMUX_PANES_FORMAT)} 2>/dev/null || true"
    raw = _run_shell_remote(task_id, list_command, timeout=30)
    sessions = {}
    windows = {}
    for line in raw.splitlines():
        fields = line.split("|MYLAB|", 15)
        if len(fields) != 16:
            continue
        (
            session_id,
            session_name,
            session_attached,
            session_windows,
            window_id,
            window_index,
            window_name,
            window_active,
            current_pane_id,
            pane_index,
            pane_active,
            pane_command,
            pane_title,
            pane_width,
            pane_height,
            pane_pid,
        ) = fields
        session = sessions.setdefault(
            session_id,
            {
                "id": session_id,
                "name": session_name,
                "attached": _tmux_int(session_attached) or 0,
                "windowCount": _tmux_int(session_windows) or 0,
                "windows": [],
            },
        )
        window_key = (session_id, window_id)
        window = windows.get(window_key)
        if window is None:
            window = {
                "id": window_id,
                "index": _tmux_int(window_index),
                "name": window_name,
                "active": _tmux_bool(window_active),
                "panes": [],
            }
            windows[window_key] = window
            session["windows"].append(window)
        window["panes"].append(
            {
                "id": current_pane_id,
                "index": _tmux_int(pane_index),
                "active": _tmux_bool(pane_active),
                "command": pane_command,
                "title": pane_title,
                "width": _tmux_int(pane_width),
                "height": _tmux_int(pane_height),
                "pid": _tmux_int(pane_pid),
            }
        )

    content = None
    if pane_id:
        known_panes = {
            pane["id"]
            for session in sessions.values()
            for window in session["windows"]
            for pane in window["panes"]
        }
        if pane_id not in known_panes:
            raise RuntimeError(f"tmux pane {pane_id} 不存在或已结束")
        capture = (
            "tmux capture-pane -p -J -S -"
            f"{lines} -t {shlex.quote(pane_id)}"
        )
        content = _run_shell_remote(task_id, capture, timeout=30)

    return {
        "taskId": task_id,
        "available": True,
        "reason": "" if sessions else "容器中暂无 tmux session",
        "sessions": list(sessions.values()),
        "selectedPane": pane_id or None,
        "content": content,
        "lines": lines,
        "ts": time.time(),
    }


# ---------------------------------------------------------------------------
# Kill
# ---------------------------------------------------------------------------


def kill_task(kind: str, task_id: str, confirm: str) -> dict:
    if confirm != task_id:
        raise PermissionError("确认文本与任务 ID 不一致，已拒绝终止")

    def do_kill(sess):
        bindings = _bindings()
        if kind == "command":
            bindings.post_KillCommand(sess, commandId=task_id)
        elif kind == "shell":
            bindings.post_KillShell(sess, shellId=task_id)
        elif kind == "experiment":
            bindings.post_KillExperiment(sess, id=int(task_id))
        else:
            raise ValueError(f"unknown task kind: {kind}")
        return True

    dashboard.call(do_kill)
    return {"killed": task_id, "kind": kind}


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------

dashboard: Dashboard = None  # set by serve()
