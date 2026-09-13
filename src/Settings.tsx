import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  KeyRound,
  HardDrive,
  PlugZap,
  Bell,
  CheckCircle,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { useApp, DATA_KEY } from "./store";
import {
  defaultData,
  downloadText,
  makeBackup,
  validateBackup,
  dayKey,
  safeUrl,
} from "./core";
import { bridgeRequest, callAI } from "./api";
import { Heading, Field, Notice } from "./ui";
import {
  applyConfig,
  exportConfig,
  parseConfig,
  CONFIG_MAX_BYTES,
  CONFIG_VERSION,
} from "./config-transfer";
export function SettingsPage({
  recoverStorage,
}: {
  recoverStorage: () => void;
}) {
  const { data, setData, secrets, setSecrets, notify } = useApp();
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [configStatus, setConfigStatus] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const [configDownload, setConfigDownload] = useState<{
    url: string;
    name: string;
  } | null>(null);
  useEffect(
    () => () => {
      if (configDownload) URL.revokeObjectURL(configDownload.url);
    },
    [configDownload],
  );
  const configInput = useRef<HTMLInputElement>(null);
  const latest = useRef({ data, secrets });
  latest.current = { data, secrets };
  const settings = data.settings;
  const patch = (p: Partial<typeof settings>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  async function testBridge() {
    setBusy("bridge");
    try {
      const h = await bridgeRequest(settings, secrets, "/health");
      setStatus(
        `本机连接成功 · GPU ${h.gpuConnected ? "已登录" : "尚未登录"} · X 出站：${h.xProxy || "直连"} · ${h.articleReader ? "支持微信文字正文获取" : "请重启新版本机服务以获取微信正文"}`,
      );
      notify("本机服务连接成功");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Heading
        eyebrow="A WORKSPACE THAT FEELS LIKE YOU"
        title="按你的方式，工作。"
        description="管理偏好、个人接口和本机数据。设置即时保存，密钥仅在本次打开期间使用。"
      />
      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-title">
            <Download size={20} />
            <div>
              <h2>配置迁移</h2>
              <p>保存接口、密钥、订阅来源与偏好，更新后选择文件即可恢复。</p>
            </div>
          </div>
          <Notice tone="warning">
            导出的 JSON 包含明文 API Key、X
            Token、配对码及私人接口地址，请保存在自己的设备上，勿上传 GitHub
            或分享。密钥导入后仅用于当前页面，刷新后可再次导入。
          </Notice>
          <div className="button-group wrap">
            <button
              className="secondary"
              disabled={configBusy}
              onClick={() => {
                try {
                  const name = `MyLab-settings-v${CONFIG_VERSION}-${dayKey()}.json`;
                  const text = exportConfig(data, secrets);
                  const url = URL.createObjectURL(
                    new Blob([text], {
                      type: "application/json;charset=utf-8",
                    }),
                  );
                  setConfigDownload({ name, url });
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = name;
                  link.click();
                  setConfigStatus(
                    `已发起配置下载。${secrets.aiKey || secrets.xKey ? "" : "当前未填写模型 API Key 和 X Token，文件中这两项为空。"}请确认浏览器已保存文件。`,
                  );
                } catch (e) {
                  setConfigStatus((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              导出配置（含密钥）
            </button>
            <button
              className="secondary"
              disabled={configBusy}
              onClick={() => configInput.current?.click()}
            >
              <Upload size={16} />
              {configBusy ? "正在导入…" : "一键导入配置"}
            </button>
            <input
              ref={configInput}
              hidden
              type="file"
              accept=".json,application/json"
              aria-label="选择配置 JSON 文件"
              onChange={async (e) => {
                const input = e.currentTarget,
                  file = input.files?.[0];
                if (!file) return;
                setConfigBusy(true);
                try {
                  if (file.size > CONFIG_MAX_BYTES)
                    throw Error("配置文件不能超过 2 MB");
                  const config = parseConfig(await file.text());
                  const next = applyConfig(
                    latest.current.data,
                    latest.current.secrets,
                    config,
                  );
                  setData(next.data);
                  setSecrets(next.secrets);
                  setStatus("");
                  setConfigStatus(
                    "配置已导入：接口、密钥与偏好已应用，订阅按 ID 合并。配对码若已过期，请填写本机服务的新配对码。",
                  );
                  notify("配置已恢复");
                } catch (e) {
                  setConfigStatus((e as Error).message);
                } finally {
                  setConfigBusy(false);
                  input.value = "";
                }
              }}
            />
          </div>
          {configDownload && (
            <p>
              <a
                className="text-button"
                href={configDownload.url}
                download={configDownload.name}
              >
                若未自动下载，点击保存配置 JSON
              </a>
            </p>
          )}
          <p className="content-scope">
            导入会覆盖文件中提供的配置项（空值也会恢复），缺少的项目保留当前值。任务、文章和周报请使用下方的数据备份；本机
            .env 配置与 GPU 登录会话不在此文件中。
          </p>
          {configStatus && (
            <div role="status">
              <Notice>{configStatus}</Notice>
            </div>
          )}
        </section>
        <section className="settings-card">
          <div className="settings-title">
            <KeyRound size={20} />
            <div>
              <h2>模型与翻译</h2>
              <p>助手、翻译与周报生成共用这一组接口配置。</p>
            </div>
          </div>
          <div className="form-stack">
            <Field label="模型接口地址">
              <input
                value={settings.aiBase}
                onChange={(e) => patch({ aiBase: e.target.value })}
                placeholder="https://api.deepseek.com"
              />
            </Field>
            <Field label="模型名称">
              <input
                value={settings.aiModel}
                onChange={(e) => patch({ aiModel: e.target.value })}
                placeholder="填写服务支持的模型名称"
              />
            </Field>
            <Field
              label="个人 API Key"
              hint="仅保留在页面内存。可用上方配置导出保存，刷新或关闭后导入恢复；不会提交 GitHub。"
            >
              <input
                type="password"
                autoComplete="off"
                value={secrets.aiKey}
                onChange={(e) =>
                  setSecrets((s) => ({ ...s, aiKey: e.target.value }))
                }
                placeholder="sk-…"
              />
            </Field>
            <Field label="默认翻译提示词">
              <textarea
                rows={4}
                value={settings.translationPrompt}
                onChange={(e) => patch({ translationPrompt: e.target.value })}
              />
            </Field>
            <div className="button-group">
              <button
                className="secondary"
                disabled={busy === "ai"}
                onClick={async () => {
                  setBusy("ai");
                  try {
                    const result = await callAI(settings, secrets.aiKey, [
                      { role: "user", content: "仅回复：连接成功" },
                    ]);
                    notify("模型回复：" + result.slice(0, 80));
                  } catch (e) {
                    notify((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === "ai" ? "测试中…" : "测试模型连接"}
              </button>
              <button
                className="text-button"
                onClick={() => setSecrets((s) => ({ ...s, aiKey: "" }))}
              >
                清除密钥
              </button>
            </div>
          </div>
        </section>
        <section className="settings-card">
          <div className="settings-title">
            <PlugZap size={20} />
            <div>
              <h2>数据连接</h2>
              <p>本机服务连接实验室内网与外部订阅。</p>
            </div>
          </div>
          <div className="form-stack">
            <Field label="本机连接服务地址">
              <input
                value={settings.bridgeUrl}
                onChange={(e) => patch({ bridgeUrl: e.target.value })}
                placeholder="http://127.0.0.1:4318"
              />
            </Field>
            <Field
              label="本机服务配对码"
              hint="运行 npm run bridge 后在本机终端查看。配对码只保留在页面内存。"
            >
              <input
                type="password"
                autoComplete="off"
                value={secrets.bridgeKey}
                onChange={(e) =>
                  setSecrets((s) => ({ ...s, bridgeKey: e.target.value }))
                }
              />
            </Field>
            <button
              className="secondary"
              disabled={busy === "bridge"}
              onClick={testBridge}
            >
              {busy === "bridge" ? "连接中…" : "测试本机连接"}
            </button>
            {status && <Notice>{status}</Notice>}
            <Field label="实验室 GPU 系统地址">
              <input
                value={settings.gpuUrl}
                onChange={(e) => patch({ gpuUrl: e.target.value })}
                placeholder="http://你的实验室地址:端口"
              />
            </Field>
            <Field
              label="个人 X API Bearer Token（可选）"
              hint="仅用于读取你订阅的账号；X 官方接口可能产生使用费用。"
            >
              <input
                type="password"
                autoComplete="off"
                value={secrets.xKey}
                onChange={(e) =>
                  setSecrets((s) => ({ ...s, xKey: e.target.value }))
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="自定义订阅读取方式">
                <select
                  value={settings.feedMode}
                  onChange={(e) =>
                    patch({
                      feedMode: e.target.value as typeof settings.feedMode,
                    })
                  }
                >
                  <option value="bridge">通过本机服务</option>
                  <option value="direct">浏览器直接读取</option>
                </select>
              </Field>
              <Field label="X 页面自动检查（公众号在阅读页单独设置）">
                <select
                  value={settings.autoRefresh}
                  onChange={(e) =>
                    patch({ autoRefresh: Number(e.target.value) })
                  }
                >
                  <option value={0}>手动更新</option>
                  <option value={15}>每 15 分钟</option>
                  <option value={30}>每 30 分钟</option>
                  <option value={60}>每小时</option>
                </select>
              </Field>
            </div>
          </div>
        </section>
        <section className="settings-card">
          <div className="settings-title">
            <HardDrive size={20} />
            <div>
              <h2>数据与备份</h2>
              <p>当前浏览器中的记录不会自动跨设备同步。</p>
            </div>
          </div>
          <div className="data-counts">
            <span>
              {data.tasks.length}
              <small>待办</small>
            </span>
            <span>
              {data.articles.length}
              <small>文章</small>
            </span>
            <span>
              {data.events.length}
              <small>日程</small>
            </span>
            <span>
              {data.reports.length}
              <small>周报</small>
            </span>
          </div>
          <Notice>
            建议定期导出备份，周报草稿也会一并保存。备份不包含密钥、实验室地址或订阅接口地址；任务、文章和周报内容可能包含个人信息，请自行妥善保存。
          </Notice>
          <div className="button-group wrap">
            <button
              className="secondary"
              onClick={() =>
                downloadText(
                  `MyLab-backup-${dayKey()}.json`,
                  JSON.stringify(makeBackup(data), null, 2),
                )
              }
            >
              <Download size={16} />
              导出备份
            </button>
            <label className="secondary file-button">
              <Upload size={16} />
              合并导入备份
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 15_000_000)
                      throw Error("备份文件不能超过 15 MB");
                    const incoming = validateBackup(
                      JSON.parse(await file.text()),
                    );
                    recoverStorage();
                    setData((d) => {
                      const merge = <T extends { id: string }>(
                        a: T[],
                        b: T[],
                      ) =>
                        Array.from(
                          new Map([...a, ...b].map((x) => [x.id, x])).values(),
                        );
                      return {
                        ...d,
                        tasks: merge(d.tasks, incoming.tasks),
                        events: merge(d.events, incoming.events),
                        articles: merge(d.articles, incoming.articles),
                        sources: merge(d.sources, incoming.sources),
                        requests: merge(d.requests, incoming.requests),
                        reports: merge(d.reports, incoming.reports).sort(
                          (a, b) => b.weekStart.localeCompare(a.weekStart),
                        ),
                      };
                    });
                    notify("已合并备份：同 ID 记录采用导入内容，现有设置保留");
                  } catch (err) {
                    notify((err as Error).message);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <button
            className="text-button raw-export"
            onClick={() =>
              downloadText(
                `MyLab-raw-${dayKey()}.json`,
                localStorage.getItem(DATA_KEY) || "{}",
              )
            }
          >
            导出原始存储（用于恢复）
            <ArrowUpRight size={13} />
          </button>
        </section>
        <section className="settings-card">
          <div className="settings-title">
            <Bell size={20} />
            <div>
              <h2>个人偏好与提醒</h2>
              <p>保持安静，在需要时给你帮助。</p>
            </div>
          </div>
          <div className="form-stack">
            <Field label="工作空间名称">
              <input
                maxLength={30}
                value={settings.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </Field>
            <Field label="外观">
              <select
                value={settings.theme}
                onChange={(e) =>
                  patch({ theme: e.target.value as typeof settings.theme })
                }
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </Field>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.assistantHints}
                onChange={(e) => patch({ assistantHints: e.target.checked })}
              />
              显示助手情境提示
            </label>
            <button
              className="secondary"
              onClick={async () => {
                if (!("Notification" in window)) {
                  notify("当前浏览器不支持系统通知");
                  return;
                }
                const permission = await Notification.requestPermission();
                notify(
                  permission === "granted"
                    ? "已启用网页运行期间的系统提醒"
                    : "未获得通知权限，仍会显示站内提醒",
                );
              }}
            >
              <Bell size={16} />
              启用浏览器提醒
            </button>
            <Notice>
              网页关闭或系统休眠时无法保证到点提醒。重要 DDL
              请在日历页导出到系统日历；本版不提供后台推送。
            </Notice>
          </div>
        </section>
      </div>
    </>
  );
}
