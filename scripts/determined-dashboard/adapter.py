"""One authenticated dashboard request over stdin/stdout; no listening socket."""
import json
import os
import sys
import types
import urllib.parse
import re
import subprocess
from types import SimpleNamespace

# The reference helper's storage/admin commands are intentionally not imported.
helper = types.ModuleType('det_cluster')
helper.DEFAULT_AUTH_DIR = ''
sys.modules['det_cluster'] = helper
import dashboard as view

_run = subprocess.run
def quiet_run(*args, **kwargs):
    if sys.platform == 'win32':
        kwargs.setdefault('creationflags', subprocess.CREATE_NO_WINDOW)
    return _run(*args, **kwargs)
view.subprocess.run = quiet_run

def dispatch(q):
    from determined.common import api
    session = q['session']
    master = api.canonicalize_master_url(session['base'])
    user = session['username']
    token = session['token']
    if not user or not token:
        raise PermissionError('请先在 MyLab 登录实验室')
    sess = api.Session(master, user, token, None, max_retries=0)
    view.dashboard = SimpleNamespace(args=None, session=lambda: (sess, master, user), call=lambda fn: (fn(sess), master, user))
    def invocation(args, command):
        env = os.environ.copy()
        env.update(DET_MASTER=master, DET_USER=user, DET_USER_TOKEN=token, PYTHONIOENCODING='utf-8')
        return [sys.executable, '-m', 'determined.cli', '-m', master, '-u', user, *command], env
    helper.cli_invocation = invocation
    # SSH tunnel subprocesses inherit the same current login, not a browser credential.
    os.environ.update(DET_MASTER=master, DET_USER=user, DET_USER_TOKEN=token)
    parsed = urllib.parse.urlparse(q['path'])
    params = dict(urllib.parse.parse_qsl(parsed.query))
    method = q.get('method', 'GET')
    if parsed.path == '/api/overview' and method == 'GET':
        tasks, warnings = {}, []
        for kind in ('command', 'shell', 'experiment'):
            try:
                tasks[kind] = [t for t in view._list_tasks(sess, kind, 'mine') if t.get('user') == user]
            except Exception:
                tasks[kind] = []
                warnings.append(kind + ' 列表读取失败')
        agents = view._agents_with_slots(sess)
        mine = {t['id'] for kind in ('command', 'shell') for t in tasks[kind]}
        mine.update(t.get('jobId') for t in tasks['experiment'] if t.get('jobId'))
        for a in agents:
            for slot in a['slots']:
                slot['mine'] = slot.get('taskId') in mine
        pools = view._pools(sess)
        view._reconcile_pool_totals(pools, agents)
        return dict(cluster=view._cluster_info(sess), pools=pools, agents=agents, tasks=tasks, master=master, user=user, time=view.time.time(), warnings=warnings)
    match = re.fullmatch(r'/api/task/(shell|command|experiment)/([a-zA-Z0-9-]+)(?:/(logs|metrics|tmux|kill))?', parsed.path)
    if not match:
        raise ValueError('不支持此看板接口')
    kind, task_id, action = match.groups()
    detail = view._task_detail(sess, kind, task_id)
    if detail.get('user') != user:
        raise PermissionError('仅允许查看或操作当前账号的任务')
    if action == 'kill' and method == 'POST':
        return view.kill_task(kind, task_id, str(q.get('body', {}).get('confirm', '')))
    if method != 'GET':
        raise ValueError('请求方法无效')
    if not action:
        return detail
    if action == 'logs':
        after = params.get('after')
        entries, trial = view._fetch_logs(sess, kind, task_id, min(2000, max(1, int(params.get('limit', 500)))), int(after) if after else None)
        return dict(entries=entries, trialId=trial, state=view._task_state(sess, kind, task_id) if params.get('state') == '1' else None)
    if kind == 'shell' and action == 'metrics':
        return view.shell_metrics(task_id)
    if kind == 'shell' and action == 'tmux':
        return view.tmux_snapshot(task_id, params)
    raise ValueError('此任务类型不支持该操作')

if __name__ == '__main__':
    try:
        result = dispatch(json.load(sys.stdin))
        print(json.dumps({'ok': True, 'data': result}, ensure_ascii=False))
    except (PermissionError, ValueError) as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}, ensure_ascii=False))
    except Exception as exc:
        # Upstream exceptions can contain credentials, response bodies or SSH key paths.
        print(json.dumps({'ok': False, 'error': '集群请求失败（'+type(exc).__name__+'），请检查登录状态、任务状态及本机 SSH 环境'}, ensure_ascii=False))
