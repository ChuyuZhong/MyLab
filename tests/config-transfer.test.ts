import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultData, makeBackup, newTask } from "../src/core.ts";
import { emptyReport } from "../src/weekly.ts";
import {
  exportConfig,
  parseConfig,
  applyConfig,
} from "../src/config-transfer.ts";
const fixture = readFileSync(
  new URL("./fixtures/settings-v1.json", import.meta.url),
  "utf8",
);
const emptySecrets = { aiKey: "", xKey: "", bridgeKey: "" };
test("version 1 fixture restores all settings, keys and source config; current exports round-trip", () => {
  const data = defaultData();
  const config = parseConfig(fixture);
  const restored = applyConfig(data, emptySecrets, config);
  assert.equal(restored.secrets.aiKey, "fixture-only-not-a-real-key");
  assert.deepEqual(restored.data.settings, JSON.parse(fixture).settings);
  assert.equal(
    restored.data.sources.find((s) => s.id === "fixture-wechat")?.feedUrl,
    "http://127.0.0.1:8001/feed/fixture.xml",
  );
  const again = applyConfig(
    defaultData(),
    emptySecrets,
    parseConfig(exportConfig(restored.data, restored.secrets)),
  );
  assert.deepEqual(again, restored);
});
test("configuration import leaves tasks, articles, weekly drafts and unrelated sources intact", () => {
  const d = defaultData();
  d.tasks = [newTask({ title: "保留我的工作" })];
  d.reports = [{ ...emptyReport("2026-09-07"), markdown: "手写原稿" }];
  const before = structuredClone(d);
  const out = applyConfig(d, emptySecrets, parseConfig(fixture));
  assert.equal(out.data.tasks, d.tasks);
  assert.equal(out.data.reports, d.reports);
  assert.equal(out.data.articles, d.articles);
  assert.equal(out.data.sources.length, 2);
  assert.deepEqual(d, before);
  const again = applyConfig(out.data, out.secrets, parseConfig(fixture));
  assert.equal(again.data.sources.length, 2);
  const saved = JSON.parse(exportConfig(out.data, out.secrets));
  assert.equal(saved.tasks, undefined);
  assert.equal(saved.reports, undefined);
  assert.equal(saved.articles, undefined);
  assert.ok(
    !JSON.stringify(makeBackup(out.data)).includes(
      "fixture-only-not-a-real-key",
    ),
  );
});
test("older files with missing fields preserve current defaults and secrets; explicit empty keys are restored", () => {
  const old = JSON.parse(fixture);
  delete old.settings.wechatRefresh;
  delete old.secrets.xKey;
  delete old.sources;
  old.secrets.aiKey = "";
  old.settings.futureField = "ignored";
  old.secrets.futureSecret = "ignored";
  const d = defaultData();
  d.settings.wechatRefresh = 30;
  const out = applyConfig(
    d,
    { ...emptySecrets, xKey: "existing-test-token" },
    parseConfig("\uFEFF" + JSON.stringify(old)),
  );
  assert.equal(out.data.settings.wechatRefresh, 30);
  assert.equal(out.secrets.xKey, "existing-test-token");
  assert.equal(out.secrets.aiKey, "");
  assert.deepEqual(out.data.sources, d.sources);
  assert.equal(Object.hasOwn(out.data.settings, "futureField"), false);
  assert.equal(Object.hasOwn(out.secrets, "futureSecret"), false);
});
test("malformed, unsupported and unsafe configuration files are rejected without exposing keys in errors", () => {
  assert.throws(
    () => parseConfig('{"secrets":"DO_NOT_ECHO_THIS_SECRET'),
    (e) => e instanceof Error && !e.message.includes("DO_NOT_ECHO"),
  );
  assert.throws(
    () => parseConfig(JSON.stringify(makeBackup(defaultData()))),
    /配置文件/,
  );
  for (const change of [
    (v: any) => {
      v.schemaVersion = 2;
    },
    (v: any) => {
      v.settings.theme = "invalid";
    },
    (v: any) => {
      v.settings.autoRefresh = -1;
    },
    (v: any) => {
      v.settings.aiBase = "javascript:alert(1)";
    },
    (v: any) => {
      v.secrets.aiKey = { bad: 1 };
    },
    (v: any) => {
      v.sources.push(v.sources[0]);
    },
    (v: any) => {
      v.sources[0].feedUrl = "file:///etc/passwd";
    },
  ]) {
    const v = JSON.parse(fixture);
    change(v);
    assert.throws(() => parseConfig(JSON.stringify(v)));
  }
  const d = defaultData();
  const c = parseConfig(fixture);
  c.sources![0].id = "x-tibo";
  const before = structuredClone(d);
  assert.throws(() => applyConfig(d, emptySecrets, c), /类型冲突/);
  assert.deepEqual(d, before);
});
