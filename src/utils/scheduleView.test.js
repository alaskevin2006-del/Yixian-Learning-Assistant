import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { performance } from "node:perf_hooks";
import {
    build24HourTicks,
    buildSubjectSummaries,
    getTaskStatus,
    TASK_STATUS,
    toggleExpandedSubject,
} from "./scheduleView.js";

test("时间轴覆盖 00:00 到 24:00 且连续", () => {
    const ticks = build24HourTicks();
    assert.equal(ticks.length, 25);
    assert.equal(ticks[0], 0);
    assert.equal(ticks[ticks.length - 1], 24);
    for (let i = 1; i < ticks.length; i += 1) {
        assert.equal(ticks[i] - ticks[i - 1], 1);
    }
});

test("两级卡片展开/收起交互状态切换", () => {
    assert.equal(toggleExpandedSubject("", "实变函数"), "实变函数");
    assert.equal(toggleExpandedSubject("实变函数", "实变函数"), "");
    assert.equal(toggleExpandedSubject("实变函数", "抽象代数"), "抽象代数");
});

test("任务状态标签判定正确", () => {
    const now = "2026-04-16";
    assert.equal(getTaskStatus({ done: true }, now).key, TASK_STATUS.done.key);
    assert.equal(getTaskStatus({ done: false, status: "doing", plannedDate: "2026-04-17" }, now).key, TASK_STATUS.doing.key);
    assert.equal(getTaskStatus({ done: false, plannedDate: "2026-04-15" }, now).key, TASK_STATUS.overdue.key);
    assert.equal(getTaskStatus({ done: false, plannedDate: "2026-04-18" }, now).key, TASK_STATUS.pending.key);
});

test("性能基线：1000 条科目汇总计算耗时 <= 100ms 且内存增长 <= 10%", () => {
    const weekDateKeys = [
        "2026-04-13",
        "2026-04-14",
        "2026-04-15",
        "2026-04-16",
        "2026-04-17",
        "2026-04-18",
        "2026-04-19",
    ];
    const tasks = Array.from({ length: 1000 }, (_, i) => ({
        id: `t_${i}`,
        subject: `科目_${i}`,
        plannedDate: weekDateKeys[i % weekDateKeys.length],
        done: i % 3 === 0,
    }));

    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    const summaries = buildSubjectSummaries({ tasks, weekDateKeys });
    const elapsed = performance.now() - start;
    const after = process.memoryUsage().heapUsed;

    const memoryGrowthRatio = before > 0 ? (after - before) / before : 0;

    assert.equal(summaries.length, 1000);
    assert.ok(elapsed <= 100, `耗时超标: ${elapsed.toFixed(2)}ms`);
    assert.ok(memoryGrowthRatio <= 0.1, `内存增长超标: ${(memoryGrowthRatio * 100).toFixed(2)}%`);
});
