---
name: align-requirements-plan-tasks
description: 对齐功能需求、现有实现约束与文档基线，并输出可直接开发的规格和任务拆解。Use when Codex needs to turn a new feature idea, docs/OPEN_REQUIREMENTS.md item, issue, PRD, or loosely described change into a concrete implementation plan for this Gridfinity frontend repo, especially when the request mentions 梳理需求、收口方案、细化规格、任务拆分、开发计划、验收标准, or updating docs/OPEN_REQUIREMENTS.md, docs/NEXT_PHASE_SPEC.md, or docs/TASK_BREAKDOWN.md.
---

# Align Requirements Plan Tasks

## Overview

Use this skill to turn a loosely defined change into four concrete outputs:

- an aligned requirement summary
- a repo-consistent spec
- a dependency-ordered development task list
- a validation plan

Prefer repo reality over generic product assumptions.

## Read Minimal Context First

Read the smallest set of files that can establish the current truth:

1. Read `docs/DEVELOPMENT_CONTEXT.md` for current product scope, architecture, and file ownership.
2. Read `docs/OPEN_REQUIREMENTS.md` if the request may overlap an unfinished or partially implemented requirement.
3. Search `docs/` for an existing dedicated spec before creating a new one.
4. Read the owning code paths for the impacted feature.

Use targeted search first, for example:

```bash
rg "关键词|templateId|feature-name" docs src
```

If `README.md` conflicts with newer docs or code, trust the newer docs and current code.

## Keep Repo Constraints In View

Anchor planning to the current repo defaults unless the requirement explicitly changes them:

- Stay within the pure frontend architecture.
- Avoid inventing backend services, storage, or accounts unless the user asks for them.
- Preserve the `/generator/:templateId` pattern unless the feature clearly needs a new route model.
- Prefer the existing `TemplateDefinition + zod + Worker` flow for new generator capabilities.
- Treat `docs/DEVELOPMENT_CONTEXT.md` and current code as the source of truth for baseline behavior.

## Align The Requirement

Reduce every request into five buckets before writing tasks:

1. Current baseline
2. Desired change
3. Hard constraints
4. Non-goals or explicit exclusions
5. Open questions or assumptions

Call out conflicts explicitly:

- docs vs code
- old plan vs current product scope
- UI expectations vs geometry or solver constraints
- requested behavior vs current template system

Ask follow-up questions only if ambiguity would materially change:

- architecture
- data shape
- validation rules
- acceptance criteria

Otherwise make the narrowest reasonable assumption and label it clearly.

## Write The Spec

When the requirement is ready to solidify, write or update the spec in the repo's existing style:

- Keep Chinese headings and concise bullets.
- Prefer direct implementation-facing language over product marketing language.
- Define usage scenarios only when they influence design decisions.
- Include only the sections the feature really needs.

Common sections:

- 目标
- 当前边界 / 非目标
- 参数或输入结构
- UI / 交互要求
- schema / 校验规则
- 几何 / 求解 / 工作流规则
- 错误态与失败提示
- 验收标准
- 典型测试用例

Choose the destination document intentionally:

- Update `docs/OPEN_REQUIREMENTS.md` for confirmed direction that is still unfinished.
- Update an existing dedicated spec file under `docs/` when the feature already has one.
- Create a new focused spec file under `docs/` when the requirement needs detailed design and no good home exists yet.
- Update `docs/NEXT_PHASE_SPEC.md` only when the change belongs to that ongoing staged spec.

Do not duplicate the same requirement across multiple docs unless each document has a different role.

## Generate Development Tasks

Turn the aligned spec into tasks that are directly implementable:

- Order by dependency, not by document section order.
- Keep each task action-oriented and testable.
- Name the owning module or file area whenever it is already clear.
- Separate implementation, UI wiring, refactors, docs, and tests when that improves execution clarity.
- Include failure handling and regression coverage, not only happy-path work.
- Mark already completed work explicitly instead of silently removing it.

Each task should answer:

- what changes
- where it changes
- what done looks like

Prefer shapes like:

1. Extend `src/lib/...` types or schema to add the new input model.
2. Add or update `src/components/...` workflow UI for the new controls and summaries.
3. Implement worker, planner, or generator logic in `src/lib/...` or `src/workers/...`.
4. Add regression coverage in `*.test.ts` or `*.test.tsx`.

Avoid vague tasks such as:

- 完善逻辑
- 优化体验
- 支持新功能

Those are not actionable unless they name a concrete behavior and code area.

## Use The Existing Doc Roles

For this repo, the three main planning documents have distinct jobs:

- `docs/OPEN_REQUIREMENTS.md`: confirmed direction that is not fully closed yet
- detailed spec files in `docs/`: design details, rules, boundaries, acceptance
- `docs/TASK_BREAKDOWN.md`: execution order only, without repeating full spec text

If a user asks only for planning and not file edits, return these three layers in the response without editing files.

## Output Contract

Before or while editing, structure the work like this:

1. Requirement alignment summary
2. Assumptions and open questions
3. Proposed spec shape
4. Development task breakdown
5. Validation plan

Keep the final output concise enough that a later implementation pass can use it directly.

## Reference

Read `references/spec-task-template.md` only when you need a ready-made planning skeleton.
