# STL 改底适配 V1 Review 文档

更新时间：2026-03-16

这份文档用于给后续 code review / QA / 交接提供一个单点上下文，描述当前 `stl-retrofit` 模板的真实落地状态，而不是需求阶段的设想版本。

## 1. 功能概述

本次新增的是一个独立模板：

- 模板 id：`stl-retrofit`
- 路由：`/generator/stl-retrofit`
- 模板名称：`STL 改底适配`

目标是：

1. 用户上传现成 STL
2. 在页面内通过 `X / Y / Z` 三轴 `90°` 步进旋转摆正模型
3. 切掉模型底部一段
4. 把整体外形规整成标准矩形 Gridfinity 实体
5. 在顶部按选项生成标准堆叠口
6. 自动补齐到 Gridfinity 标准高度单位后导出 STL

当前实现仍是纯前端架构，不引入后端或本地原生依赖。

## 2. 当前范围与边界

### 2.1 已实现范围

- 支持导入 `ASCII STL` 与 `Binary STL`
- 支持在 worker 内解析 STL 并缓存源几何
- 支持页面内 `X / Y / Z` 三轴 `90°` 旋转
- 支持自动推荐最小 `gridX / gridY`
- 支持自动补齐 `heightUnits`
- 支持切换为固定 `gridX / gridY / heightUnits`
- 支持可选磁铁孔
- 支持可选标准堆叠口
- 支持 3D 预览与 STL 导出

### 2.2 首版固定边界

- 只支持单个 STL 文件
- 不支持缩放 STL
- 不支持任意角度旋转，只支持 `90°` 步进旋转
- 不支持多个 STL 合并
- 不支持自动修复开口曲面、非流形、坏法线模型
- 若 JSCAD 布尔或网格清理不稳定，统一报为“模型不是可稳定求解的封闭实体”

## 3. 用户流程

前端流程固定为：

1. 进入 `STL 改底适配`
2. 上传 `.stl`
3. worker 解析 STL，返回 `source summary`
4. 前端把 `source summary` 写入模板参数
5. 用户按需点击 `X +90° / Y +90° / Z +90°`
6. 用户选择 `自动推荐` 或 `固定尺寸`
7. 用户调整：
   - `切除深度`
   - `外缘余量`
   - `实体层厚度`
   - `磁铁孔`
   - `标准堆叠口`
8. worker 根据 `assetId` 校验导入缓存，并生成最终模型
9. 用户预览并导出 STL

## 4. 架构与数据流

### 4.1 关键数据结构

定义集中在 `src/lib/gridfinity/types.ts`：

- `ImportedStlSourceSummary`
  - 只保存可序列化摘要，不把大网格塞进 React state
- `StlRetrofitParams`
  - 模板参数，核心字段包括：
    - `source`
    - `sizeMode`
    - `gridX / gridY / heightUnits`
    - `rotationX / rotationY / rotationZ`
    - `cutDepth`
    - `footprintMargin`
    - `minAdapterThickness`
    - `magnetHoles`
    - `stackingLip`
- `StlRetrofitPlan`
  - 规划结果，供信息面板和建模逻辑复用

### 4.2 Worker 协议扩展

worker 协议在 `src/workers/model.worker.ts` 和 `src/lib/gridfinity/types.ts` 中扩展了：

- 新请求：`import-stl`
- 新响应：`import-stl-success`

上传时前端发送：

- `fileName`
- `bytes: ArrayBuffer`

worker 返回：

- `ImportedStlSourceSummary`

### 4.3 缓存策略

worker 里现在有两套缓存：

- `geometryCache`
  - 缓存最终生成后的几何
  - 上限 `12`
- `importedAssetCache`
  - 缓存导入后的源 STL 几何
  - 上限 `6`

两套缓存都按简单 LRU 思路维护。

这样做的目的：

- React 参数里只保存轻量 summary
- 预览和导出不需要重复解析 STL
- 避免把大网格反复 postMessage 回主线程

## 5. STL 导入实现

代码入口：`src/lib/gridfinity/stlImport.ts`

### 5.1 解析规则

- 先按二进制 STL 长度规则判断：
  - `84 + triangleCount * 50 === fileLength`
- 若不满足，则回退为 ASCII STL

### 5.2 校验规则

- 文件大小上限：`25MB`
- 三角面上限：`150000`
- 空文件直接报错
- 非法数值直接报错
- 零面数或全退化三角形直接报错

### 5.3 几何清理

解析出的三角面会被转换为 JSCAD `polyhedron`，随后执行：

- `generalize({ snap: true, triangulate: true }, geometry)`

如果几何为空、包围盒无效或后续布尔失败，当前统一归为：

- `模型不是可稳定求解的封闭实体。`

## 6. 改底几何策略

代码入口：`src/lib/gridfinity/stlRetrofit.ts`

### 6.1 规划逻辑

规划输入只依赖：

- `source.originalSizeMm`
- `rotationX / rotationY / rotationZ`
- `cutDepth`
- `footprintMargin`
- `minAdapterThickness`
- `sizeMode`

旋转后的尺寸通过包围盒轴置换计算，不依赖真实几何旋转结果。

### 6.2 自动尺寸策略

自动模式当前实现是：

1. 先根据旋转后尺寸和余量求最小所需 `XY`
2. 在 `gridX/gridY = 1..8` 中找能容纳的候选
3. 排序规则固定为：
   - 占地面积最小
   - 宽度最小
   - 深度最小
4. 高度不做枚举搜索，而是直接取满足公式的最小 `heightUnits`

说明：

- 这和需求计划里的“完整 `1..8 x 1..8 x 2..24` 三维搜索”相比是一个实现层面的简化
- 当前代码行为仍满足“自动补齐到最小可用标准高度”的目标

### 6.3 高度公式

当前实现固定为：

- `preservedBodyHeight = rotatedHeight - cutDepth`
- `minimumBaseHeight = max(cutDepth, footHeight + minAdapterThickness)`
- `minimumTotalHeight = preservedBodyHeight + minimumBaseHeight`
- `heightUnits = ceil(minimumTotalHeight / 7)`
- `baseHeight = heightUnits * 7 - preservedBodyHeight`

如果 `baseHeight` 高于最小值，会产生 warning：

- `已自动补高底座，以对齐 Gridfinity 标准高度单位。`

### 6.4 最终几何流程

最终几何构建流程固定为：

1. 从 `TemplateBuildContext` 按 `assetId` 取回源几何
2. 使用源 STL 的旋转后包围盒尺寸做规划，不再直接复用原几何外形
3. 生成标准矩形主实体，整体外轮廓对齐 `gridX x gridY`
4. 底部使用标准 Gridfinity 脚位
5. 顶部在开启时生成标准堆叠口；关闭时保留标准平顶
6. 整体高度保持 `heightUnits * 7mm`

标准实体生成入口在 `src/lib/gridfinity/base.ts`：

- `createGridfinityStackableBlock(gridX, gridY, totalHeightMm, magnetHoles, stackingLip, spec)`

这个函数复用了现有脚位和磁铁孔布局，并新增顶部标准堆叠口；`stl-retrofit` 当前不再走“原模型 + 底座拼接”的路线。

## 7. 前端交互实现

主要入口：

- `src/components/StlRetrofitWorkflow.tsx`
- `src/pages/GeneratorPage.tsx`
- `src/hooks/useModelGenerator.ts`

### 7.1 UI 结构

当前专用工作流包含：

- 文件上传区
- 源模型元数据卡片
- 三组旋转按钮
- 尺寸模式切换
- `切除深度`
- `外缘余量`
- `适配层厚度`
- `磁铁孔`
- 右侧 3D 预览
- 信息面板里的规划摘要

### 7.2 生成器页摘要

`GeneratorPage` 里会展示：

- 推荐尺寸 / 固定尺寸
- 旋转后尺寸
- 切除深度
- 底座高度
- 总高度
- 源模型状态

这些摘要来自 `resolveStlRetrofitPlan()`，不是从 worker 额外回传。

## 8. 关键文件清单

### 8.1 新增文件

- `src/lib/gridfinity/stlImport.ts`
- `src/lib/gridfinity/stlRetrofit.ts`
- `src/components/StlRetrofitWorkflow.tsx`
- `src/lib/gridfinity/stlImport.test.ts`
- `src/lib/gridfinity/stlRetrofit.test.ts`

### 8.2 主要修改文件

- `src/lib/gridfinity/types.ts`
- `src/lib/gridfinity/templates.ts`
- `src/lib/gridfinity/generation.ts`
- `src/lib/gridfinity/base.ts`
- `src/workers/model.worker.ts`
- `src/hooks/useModelGenerator.ts`
- `src/pages/GeneratorPage.tsx`
- `src/pages/HomePage.tsx`
- `src/index.css`
- `src/lib/gridfinity/generation.test.ts`
- `src/pages/GeneratorPage.test.tsx`
- `src/pages/HomePage.test.tsx`
- `tests/app.spec.ts`

## 9. 当前测试与验证

本次功能落地后，已补的主要测试包括：

- `src/lib/gridfinity/stlImport.test.ts`
  - ASCII STL
  - Binary STL
  - 空文件 / 非法格式 / 超限文件
- `src/lib/gridfinity/stlRetrofit.test.ts`
  - 旋转尺寸置换
  - 自动推荐尺寸
  - 固定尺寸不足时报错
  - 切除深度变化时的高度联动
- `src/lib/gridfinity/generation.test.ts`
  - 新模板默认生成
  - 最终高度必须对齐 `7mm`
- `src/pages/GeneratorPage.test.tsx`
  - STL 改底模板路由和控件渲染
- `src/pages/HomePage.test.tsx`
  - 首页模板入口可见
- `tests/app.spec.ts`
  - 首页进入 STL 改底模板的烟雾路径

最近一次本地验证：

- `npm run test:run`
  - 通过
- `npm run build`
  - 通过
- `npm run e2e`
  - 本轮未重新执行

## 10. Review 重点建议

后续 review 建议优先盯这几类问题：

1. STL 解析容错
   - ASCII / Binary 判定是否会误判
   - 大文件和边界值的错误提示是否足够明确
2. 几何稳定性
   - `generalize / intersect / union / retessellate` 在复杂 STL 上的稳定性
   - 对非流形和薄片模型是否能稳定失败而不是挂死
3. 高度与占位规则
   - 自动高度补齐是否符合产品预期
   - 自动 `XY` 推荐是否符合“严格矩形占位”目标
4. worker 缓存
   - `assetId` 生命周期是否符合前端交互
   - 多次上传、重复导出、切模板后缓存是否合理
5. UI 状态一致性
   - 上传失败后旧模型是否应继续保留
   - `自动推荐` 切到 `固定尺寸` 时当前值是否符合预期

## 11. 已知风险与后续补强方向

- 当前自动模式没有对 `heightUnits` 做完整候选搜索，而是直接计算最小可用值
- STL 几何合法性仍强依赖 JSCAD 对三角网格布尔的容忍度
- 当前只看包围盒，不做“哪个面更适合作为底面”的自动判断
- 当前仍没有项目保存/恢复，刷新页面后需要重新上传 STL
- `three.js` 预览 chunk 体积告警仍存在，但不阻塞功能

如果后续要继续迭代，优先级建议是：

1. 增加更多真实 STL 回归夹具
2. 评估更稳的网格修复或 manifold 检查策略
3. 考虑增加“自动选底面”或“常用朝向预设”
4. 评估是否需要把 `heightUnits` 也纳入完整候选搜索
