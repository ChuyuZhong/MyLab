import {GpuApply,MyGpuTasks} from "./GpuTools";
import { useEffect, useState, useRef } from "react";
import {
  Cpu,
  Plus,
  RefreshCw,
  Server,
  ExternalLink as LinkIcon,
  Check,
  Download,
  ArrowUpRight,
  Clock,
  HardDrive,
  PlugZap,
} from "lucide-react";
import { useApp } from "./store";
import { bridgeRequest } from "./api";
import { Heading, Empty, Notice, Field, Modal, ExternalLink } from "./ui";
import { downloadText, safeUrl } from "./core";
import type { GpuRequest, GpuSnapshot } from "./types";
export function GpuPage() {
  const { data, setData, secrets, notify, navigate } = useApp();
  const [snapshot, setSnapshot] = useState<GpuSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [request, setRequest] = useState<GpuRequest | null>(null);
  const [pool, setPool] = useState("all");
  const [card, setCard] = useState<{agent: string; slot: string} | null>(null);
  const [revision,setRevision]=useState(0);
  const [applyPool,setApplyPool]=useState("");
  const [monitor, setMonitor] = useState(true);
  const refreshing = useRef(false);
  const selectedAgent = snapshot?.agents.find(a => a.id === card?.agent);
  const selectedSlot = selectedAgent?.slots.find(s => s.id === card?.slot);
  async function refresh(quiet = false) {
    if (refreshing.current) return;
    refreshing.current = true;
    setBusy(true);
    try {
      const s = await bridgeRequest(data.settings, secrets, "/gpu");
      if (!Array.isArray(s.agents) || !Array.isArray(s.pools))
        throw Error("资源接口返回格式不正确");
      setSnapshot(s);
      setRevision(r=>r+1);
      setError("");
      if (!quiet) notify(`已读取 ${s.agents.length} 个节点的真实资源状态`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      refreshing.current = false;
    }
  }
  useEffect(() => {
    if (secrets.bridgeKey) void refresh();
  }, []);
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => {
    if (!monitor || !secrets.bridgeKey) return;
    const check = () => {if(document.visibilityState === "visible") void refreshRef.current(true);};
    const timer = setInterval(check, 30000);
    document.addEventListener("visibilitychange", check);
    return () => {clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  }, [monitor,secrets.bridgeKey]);
  const agents =
    snapshot?.agents.filter(
      (a) => pool === "all" || a.resourcePool.split(", ").includes(pool),
    ) || [];
  const slots = agents.flatMap((a) => a.slots);
  const allocated = slots.filter((s) => s.allocated).length;
  const available = agents.flatMap((a) =>
    a.enabled ? a.slots.filter((s) => s.enabled && !s.allocated) : [],
  ).length;
  const create = () =>
    setRequest({
      id: crypto.randomUUID(),
      title: "",
      count: 1,
      memory: 24,
      start: "",
      hours: 24,
      notes: "",
      status: "draft",
      createdAt: new Date().toISOString(),
    });
  return (
    <>
      <Heading
        eyebrow="COMPUTE, WITH CLARITY"
        title="让算力，跟上想法。"
        description="查看实验室资源，整理个人申请与实验安排。"
        action={
          <button className="primary" onClick={create}>
            <Plus size={18} />
            新建申请草稿
          </button>
        }
      />
      <div className="gpu-toolbar">
        <label><input type="checkbox" checked={monitor} onChange={e=>setMonitor(e.target.checked)}/> 每 30 秒监测（页面可见时）</label>
        <div className="button-group">
          <span
            className={"status-tag " + (snapshot && !error ? "success" : "")}
          >
            {snapshot && !error
              ? "真实资源 · 已连接"
              : snapshot
                ? "连接异常 · 上次状态"
                : "等待连接实验室"}
          </span>
          {snapshot && (
            <span className="muted">
              更新于 {new Date(snapshot.fetchedAt).toLocaleTimeString("zh-CN")}
            </span>
          )}
        </div>
        <div className="button-group">
          <button className="secondary" onClick={() => setLogin(true)}>
            <PlugZap size={16} />
            连接 / 登录
          </button>
          <button className="secondary" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            {busy ? "读取中" : "刷新"}
          </button>
          <ExternalLink
            url={
              data.settings.gpuUrl
                ? data.settings.gpuUrl.replace(/\/$/, "") + "/det/clusters"
                : ""
            }
            local
            className="secondary"
          >
            原管理系统
          </ExternalLink>
        </div>
      </div>
      {error && (
        <Notice tone="warning">
          {error}
          {snapshot && " 当前仍展示上次读取的数据，请勿据此判断可用资源。"}
          <button className="text-button" onClick={() => navigate("settings")}>
            检查连接设置 <ArrowUpRight size={13} />
          </button>
        </Notice>
      )}
      <div className="gpu-stats">
        {[
          [Server, "在线节点", snapshot ? agents.length : "—"],
          [Cpu, "GPU 插槽", snapshot ? slots.length : "—"],
          [HardDrive, "已分配", snapshot ? allocated : "—"],
          [Check, "未分配且启用", snapshot ? available : "—"],
        ].map(([Icon, label, value]) => {
          const I = Icon as typeof Cpu;
          return (
            <div key={String(label)}>
              <span className="gpu-stat-icon">
                <I size={21} />
              </span>
              <div>
                <span>{String(label)}</span>
                <strong>{value as string | number}</strong>
              </div>
            </div>
          );
        })}
      </div>
      <div className="section-heading">
        <h2>节点与资源池</h2><div className="button-group">{["s3-4090","d2-a800"].map(p=><button className="secondary" key={p} onClick={()=>setApplyPool(p)}>申请 {p}</button>)}</div>
        <select
          className="inline-select"
          aria-label="筛选资源池"
          value={pool}
          onChange={(e) => setPool(e.target.value)}
        >
          <option value="all">全部资源池</option>
          {snapshot?.pools.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {!snapshot ? (
        <div className="surface">
          <Empty
            icon={<Server size={30} />}
            heading="把实验室的算力，带到眼前。"
            action={
              <button className="primary" onClick={() => setLogin(true)}>
                <PlugZap size={17} />
                连接实验室
              </button>
            }
          >
            启动本机连接服务，在设置中填写配对码。
            <br />
            资源状态按需读取，登录会话仅保留在服务内存。
          </Empty>
        </div>
      ) : (
        <div className="gpu-node-grid">
          {agents.map((a) => (
            <article className="gpu-node" key={a.id}>
              <div className="node-heading">
                <span className="node-icon">
                  <Server size={21} />
                </span>
                <div>
                  <h3>{a.name}</h3>
                  <small>{a.resourcePool}</small>
                </div>
                <span className={"status-tag " + (a.enabled ? "success" : "")}>
                  {a.enabled ? "已启用" : "已禁用"}
                </span>
              </div>
              <p className="gpu-model">
                {[...new Set(a.slots.map((s) => s.device))].join(" / ")}
              </p>
              <div className="gpu-slot-grid">
                {a.slots.map((s) => (
                  <button
                    onClick={() => setCard({agent:a.id,slot:s.id})}
                    key={s.id}
                    className={
                      "gpu-slot " +
                      (!s.enabled
                        ? "disabled"
                        : s.allocated
                          ? "allocated"
                          : "available")
                    }
                    title={`GPU ${s.id} · ${s.state}`}
                  >
                    <Cpu size={17} />
                    <strong>GPU {s.id}</strong>
                    <span>
                      {!s.enabled
                        ? "已禁用"
                        : s.allocated
                          ? "已分配"
                          : "未分配"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="node-footer">
                <span>{a.slots.length} 张 GPU</span>
                <span>
                  {a.slots.filter((s) => s.allocated).length} 张已分配
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
      <Notice>
        “未分配”是调度器的分配状态，不代表 GPU
        利用率或申请权限。点击空闲卡在侧栏申请；我的集群任务支持监控与释放。
      </Notice>
      <div className="section-heading requests-heading">
        <h2>我的申请与使用记录</h2>
        <button className="text-button" onClick={create}>
          <Plus size={15} />
          添加记录
        </button>
      </div>
      {data.requests.length ? (
        <div className="request-list">
          {data.requests.map((r) => (
            <div className="request-row" key={r.id}>
              <span className="request-icon">
                <Cpu size={19} />
              </span>
              <div>
                <strong>{r.title}</strong>
                <small>
                  {r.count} 张 · 每张至少 {r.memory} GB · 预计 {r.hours} 小时
                </small>
              </div>
              <span className="status-tag">
                {
                  {
                    draft: "草稿 · 未提交",
                    recorded: "使用中 · 手动记录",
                    finished: "已结束 · 手动记录",
                  }[r.status]
                }
              </span>
              <button className="text-button" onClick={() => setRequest(r)}>
                编辑
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="small-empty">
          还没有申请记录。先写下用途、需要的显存与预计时长。
        </div>
      )}
      {login && (
        <Modal
          title="连接实验室 GPU 系统"
          onClose={() => {
            setLogin(false);
            setPassword("");
          }}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await bridgeRequest(data.settings, secrets, "/gpu/login", {
                  base: data.settings.gpuUrl,
                  username,
                  password,
                });
                setPassword("");
                setLogin(false);
                await refresh();
              } catch (err) {
                notify((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Notice>
              凭据仅发送给本机服务及你指定的实验室系统，不会写入文件。服务重启后需要重新登录。
            </Notice>
            <Field label="实验室系统地址">
              <input
                required
                type="url"
                value={data.settings.gpuUrl}
                placeholder="http://你的实验室地址:端口"
                onChange={(e) =>
                  setData((d) => ({
                    ...d,
                    settings: { ...d.settings, gpuUrl: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="用户名">
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label="密码">
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setLogin(false);
                  setPassword("");
                }}
              >
                取消
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "正在连接…" : "登录并读取资源"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      <MyGpuTasks revision={revision}/>
      {applyPool && <Modal drawer title="申请资源" onClose={()=>setApplyPool("")}><GpuApply pool={applyPool} onCreated={()=>{setRevision(r=>r+1);void refresh(true);}}/></Modal>}
      {card && (
        <Modal drawer title="GPU 详情" onClose={() => setCard(null)}>
          <div className="gpu-detail">
            <h3>{selectedAgent?.name || card.agent} · GPU {card.slot}</h3>
            {!selectedSlot ? <Notice tone="warning">该卡已不在当前资源快照中。</Notice> : <>
              <dl><dt>型号</dt><dd>{selectedSlot.device}</dd><dt>资源池</dt><dd>{selectedAgent?.resourcePool}</dd><dt>调度状态</dt><dd>{selectedSlot.state}</dd><dt>启用状态</dt><dd>{selectedAgent?.enabled && selectedSlot.enabled ? "启用" : "禁用"}</dd><dt>显存</dt><dd>{selectedSlot.memory === null ? "接口未提供" : `${selectedSlot.memory} GB`}</dd><dt>更新时间</dt><dd>{snapshot && new Date(snapshot.fetchedAt).toLocaleString("zh-CN")}</dd></dl>
              {error && <Notice tone="warning">连接异常，当前状态可能已过期。</Notice>}
              {selectedAgent?.enabled && selectedSlot.enabled && !selectedSlot.allocated && !error && <GpuApply key={selectedAgent.resourcePool} pool={selectedAgent.resourcePool.split(', ').find(p=>['s3-4090','d2-a800'].includes(p))||selectedAgent.resourcePool} onCreated={()=>{setRevision(r=>r+1);void refresh(true);}}/>}
              <Notice>任务的逐卡监控、开始日期、Max days 与释放操作位于“我的集群任务”详情。申请按资源池调度。</Notice>
              <ExternalLink local url={data.settings.gpuUrl.replace(/\/$/,"")+"/det/clusters"}>前往集群管理系统</ExternalLink>
            </>}
          </div>
        </Modal>
      )}
      {request && (
        <Modal title="GPU 申请草稿 / 个人记录" onClose={() => setRequest(null)}>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              setData((d) => ({
                ...d,
                requests: d.requests.some((r) => r.id === request.id)
                  ? d.requests.map((r) => (r.id === request.id ? request : r))
                  : [request, ...d.requests],
              }));
              notify("已保存个人记录，未向实验室提交申请");
              setRequest(null);
            }}
          >
            <Field label="实验名称与用途">
              <input
                autoFocus
                required
                maxLength={200}
                value={request.title}
                onChange={(e) =>
                  setRequest({ ...request, title: e.target.value })
                }
                placeholder="例如：变化检测模型对照实验"
              />
            </Field>
            <div className="form-grid">
              <Field label="GPU 数量">
                <input
                  type="number"
                  min={1}
                  max={128}
                  required
                  value={request.count}
                  onChange={(e) =>
                    setRequest({ ...request, count: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="最低显存 / GB">
                <input
                  type="number"
                  min={1}
                  max={1024}
                  required
                  value={request.memory}
                  onChange={(e) =>
                    setRequest({ ...request, memory: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="期望开始时间">
                <input
                  type="datetime-local"
                  value={request.start}
                  onChange={(e) =>
                    setRequest({ ...request, start: e.target.value })
                  }
                />
              </Field>
              <Field label="预计时长 / 小时">
                <input
                  type="number"
                  min={1}
                  max={8760}
                  required
                  value={request.hours}
                  onChange={(e) =>
                    setRequest({ ...request, hours: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <Field label="个人记录状态">
              <select
                value={request.status}
                onChange={(e) =>
                  setRequest({
                    ...request,
                    status: e.target.value as GpuRequest["status"],
                  })
                }
              >
                <option value="draft">申请草稿 · 尚未提交</option>
                <option value="recorded">使用中 · 我已在原系统完成申请</option>
                <option value="finished">已结束 · 我已在原系统释放资源</option>
              </select>
            </Field>
            <Field label="备注">
              <textarea
                rows={3}
                value={request.notes}
                onChange={(e) =>
                  setRequest({ ...request, notes: e.target.value })
                }
              />
            </Field>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  downloadText(
                    "GPU申请草稿.txt",
                    `${request.title}\nGPU 数量：${request.count}\n最低显存：${request.memory} GB\n期望开始：${request.start}\n预计时长：${request.hours} 小时\n备注：${request.notes}\n\n此文件为个人草稿，未向实验室系统提交。`,
                    "text/plain",
                  )
                }
              >
                <Download size={16} />
                导出草稿
              </button>
              <button className="primary">保存个人记录</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
