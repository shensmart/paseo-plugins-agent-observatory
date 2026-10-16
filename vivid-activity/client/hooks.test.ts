import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 本地补丁（0.5.0）：React 的 Hook 必须无条件、按固定顺序调用。把 `use*()` 放进三元或 `&&` 的右侧，
 * 会在条件翻转时改变调用数量，React 的状态随之错位——报出来的错往往与真正的原因毫无关系
 * （实测：`orphaned` 从 false 翻到 true 让 `useRowStamp()` 被跳过，报成宿主 `useSettings` 内部的
 * `Cannot read properties of undefined (reading 'length')`，极难定位）。
 * 这里做一次静态检查，把这种写法挡在提交前。
 */
function sourceFiles(entry: string): string[] {
  const out: string[] = [];
  const walk = (file: string) => {
    const stat = readFileSync(file, "utf8");
    if (file.endsWith(".ts") || file.endsWith(".tsx")) out.push(file);
    else void stat;
  };
  const visit = (target: string) => {
    for (const name of readdirSync(target, { withFileTypes: true })) {
      const full = path.join(target, name.name);
      if (name.isDirectory()) visit(full);
      else if (/\.tsx?$/.test(name.name) && !/\.test\.tsx?$/.test(name.name)) walk(full);
    }
  };
  visit(entry);
  return out;
}

/** `useFoo(` on a line that also decides whether it runs. */
const CONDITIONAL_HOOK = /(?:\?|&&|\|\|)[^\n]*\buse[A-Z][A-Za-z0-9]*\s*\(/;

describe("hook discipline", () => {
  it("never calls a hook from a conditional expression", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(dir, ".."))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (CONDITIONAL_HOOK.test(line)) offenders.push(`${path.relative(path.join(dir, ".."), file)}:${index + 1} ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
