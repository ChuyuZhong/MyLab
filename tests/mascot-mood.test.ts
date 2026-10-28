import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { emitMascot, markActive, mascotSnapshot } from "../src/mascot-mood.ts";

const at = (time: string) => new Date(`2026-10-26T${time}`).getTime();
mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: at("10:00:00") });

test("小鲸 works by day, dozes off when idle and wakes up sheepishly", () => {
  markActive();
  assert.equal(mascotSnapshot().mood, "work");
  mock.timers.tick(2 * 60_000);
  assert.equal(mascotSnapshot().mood, "work");
  mock.timers.tick(61_000);
  assert.equal(mascotSnapshot().mood, "sleep");
  markActive();
  const woken = mascotSnapshot();
  assert.equal(woken.mood, "smile");
  assert.ok(woken.line);
  mock.timers.tick(4000);
  assert.deepEqual(mascotSnapshot(), { mood: "work", busy: false, line: "" });
});

test("reactions show for a few seconds, then she returns to her base mood", () => {
  markActive();
  emitMascot("task-done");
  assert.equal(mascotSnapshot().mood, "smile");
  mock.timers.tick(4000);
  assert.equal(mascotSnapshot().mood, "work");
  emitMascot("task-deleted");
  assert.equal(mascotSnapshot().mood, "pout");
  mock.timers.tick(3000);
  assert.equal(mascotSnapshot().mood, "work");
});

test("model calls keep her thinking until every request settles", () => {
  markActive();
  emitMascot("ai-start");
  emitMascot("ai-start");
  assert.deepEqual(
    { mood: mascotSnapshot().mood, busy: mascotSnapshot().busy },
    { mood: "work", busy: true },
  );
  emitMascot("ai-done");
  assert.equal(mascotSnapshot().busy, true);
  emitMascot("ai-error");
  assert.deepEqual(
    { mood: mascotSnapshot().mood, busy: mascotSnapshot().busy },
    { mood: "rage", busy: false },
  );
  mock.timers.tick(5000);
  assert.equal(mascotSnapshot().mood, "work");
  emitMascot("ai-start");
  emitMascot("ai-stop");
  assert.equal(mascotSnapshot().mood, "work");
});

test("she eats rice at mealtimes and gives up early after midnight", () => {
  mock.timers.setTime(at("12:10:00"));
  markActive();
  assert.equal(mascotSnapshot().mood, "eat");
  mock.timers.setTime(at("18:00:00"));
  markActive();
  assert.equal(mascotSnapshot().mood, "eat");
  mock.timers.setTime(at("15:00:00"));
  markActive();
  assert.equal(mascotSnapshot().mood, "work");
  mock.timers.setTime(at("23:59:00"));
  markActive();
  mock.timers.setTime(at("23:59:31"));
  assert.equal(mascotSnapshot().mood, "work");
  mock.timers.setTime(at("02:00:00"));
  markActive();
  mock.timers.tick(31_000);
  assert.equal(mascotSnapshot().mood, "sleep");
});

test("picked up she stays dazed until dropped, then recovers after landing", () => {
  mock.timers.setTime(at("15:00:00"));
  markActive();
  emitMascot("ai-start");
  emitMascot("grab");
  const held = mascotSnapshot();
  assert.equal(held.mood, "grab");
  assert.equal(held.busy, false);
  assert.ok(held.line);
  mock.timers.tick(30_000);
  assert.equal(mascotSnapshot().mood, "grab", "still held, no timeout");
  emitMascot("ai-done");
  assert.equal(mascotSnapshot().mood, "grab", "held beats every reaction");
  emitMascot("drop");
  assert.equal(mascotSnapshot().mood, "grab", "dazed for a moment after landing");
  mock.timers.tick(2000);
  assert.deepEqual(mascotSnapshot(), { mood: "work", busy: false, line: "" });
  emitMascot("hint");
  assert.equal(mascotSnapshot().mood, "smile");
  assert.match(mascotSnapshot().line, /小鲸/);
});
