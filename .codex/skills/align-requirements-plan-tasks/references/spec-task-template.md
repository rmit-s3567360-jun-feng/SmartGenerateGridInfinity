# Spec And Task Template

Use this file only when you need a ready-made structure for a planning response or doc update.

## 1. Requirement Alignment

- 当前基线：
- 目标变化：
- 硬约束：
- 非目标：
- 假设 / 待确认：

## 2. Spec Skeleton

```md
# <Feature Name>

更新时间：<YYYY-MM-DD>

## 1. 目标

- ...

## 2. 当前边界 / 非目标

- ...

## 3. 参数或输入

- ...

## 4. UI / 交互要求

- ...

## 5. 规则与校验

- ...

## 6. 错误态

- ...

## 7. 验收标准

- ...

## 8. 测试用例

- ...
```

## 3. Task Breakdown Skeleton

```md
# Task Breakdown

## Phase X: <Feature Name>

1. 扩展 `src/lib/...` 类型与 schema
2. 更新 `src/components/...` 或 `src/pages/...` 的交互入口
3. 实现 `src/lib/...` / `src/workers/...` 的核心逻辑
4. 增加失败态、提示文案或摘要信息
5. 增加 `*.test.ts` / `*.test.tsx` 回归测试
```

## 4. Validation Checklist

- `npm run lint`
- `npm run test:run`
- `npm run build`

Add `npm run e2e` when the change affects end-to-end workflow or routing.
