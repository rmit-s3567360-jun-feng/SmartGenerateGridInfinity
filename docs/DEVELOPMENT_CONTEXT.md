# Development Context

更新时间：2026-03-22

补充规格文档：

- `docs/OPEN_REQUIREMENTS.md`
- `docs/NEXT_PHASE_SPEC.md`
- `docs/TASK_BREAKDOWN.md`
- `docs/PARAMETRIC_SHAPE_CAVITY_SPEC.md`
- `docs/STL_RETROFIT_V1_REVIEW.md`
- `docs/STL_CAVITY_WORKFLOWS_SPEC.md`

说明：

- 当前代码基线、实现状态和交接提醒继续维护在本文件
- 所有未完成、已确认方向的需求统一维护在 `docs/OPEN_REQUIREMENTS.md`
- 参数化型腔盒模板的输入、求解、UI 和测试边界单独维护在 `docs/PARAMETRIC_SHAPE_CAVITY_SPEC.md`
- STL 相关两条工作流的细节继续分别维护在 `docs/STL_RETROFIT_V1_REVIEW.md` 与 `docs/STL_CAVITY_WORKFLOWS_SPEC.md`

## 1. 项目定位

这是一个纯前端的 Gridfinity 参数化模型生成网站，目标是：

- 在浏览器里调整参数
- 生成符合常见 Gridfinity 兼容尺寸的收纳模型
- 实时预览 3D 网格
- 导出可 3D 打印的 STL / 3MF

当前版本不做账号、云端模板库、项目协作、底板 / 盖子生态。

## 2. 当前已实现范围

- 首页：模板入口、能力说明、Gridfinity 规格说明
- 生成器页：`/generator/:templateId`
- 当前模板数量：6 个
  - `generic-bin`
  - `parametric-cavity-bin`
  - `memory-card-tray`
  - `photo-outline-bin`
  - `stl-cavity-bin`
  - `stl-retrofit`
- 参数系统：
  - 支持 `string | number | boolean`
  - 支持数组与结构化对象参数
  - 已落地复杂参数包括：
    - `shapeEntries`
    - 照片轮廓 `analysis`
    - 导入 STL 的 `source`
- 参数 UI：
  - 分段式参数面板与桌面端 sticky 左栏
  - 卡片式单选、segmented control 与整行开关
  - Unity Inspector 风格 `X / Y / Z` 输入
  - 数字输入纯手输，不显示上下箭头
  - 参数解释统一通过悬浮问号展示
  - 已补齐 `1600px / 1920px` 超宽屏布局适配
- 几何生成：浏览器内 Worker 执行
- 3D 预览：`three.js`
- 导出格式：`STL / 3MF`
- 辅助脚本：
  - Windows 本地一键启动
  - Linux 云服务器构建发布

## 3. 技术栈

- 前端：React 19 + TypeScript + Vite
- 路由：React Router
- 参数校验：zod
- 几何建模：`@jscad/modeling`
- 导出序列化：`@jscad/stl-serializer`、`@jscad/3mf-serializer`
- 3D 预览：`three.js`
- 测试：
  - Vitest
  - Testing Library
  - Playwright

## 4. 核心文件与职责

- `src/pages/HomePage.tsx`
  - 首页与模板入口
- `src/pages/GeneratorPage.tsx`
  - 模板切换、参数工作流分流、导出按钮、规格摘要
- `src/components/ParameterPanel.tsx`
  - 通用参数面板、section 渲染、展示控件切换、Tooltip 和高级参数折叠
- `src/components/AxisInspectorGroup.tsx`
  - `X / Y / Z` 分组输入
- `src/components/FieldHint.tsx`
  - 参数解释问号提示
- `src/components/ParametricCavityWorkflow.tsx`
  - 参数化型腔盒的形状列表、复制粘贴、手动生成、固定旋转与排列方式编辑
- `src/components/PhotoOutlineWorkflow.tsx`
  - 照片轮廓模板专用界面
- `src/components/StlCavityWorkflow.tsx`
  - STL 型腔收纳模板专用界面
- `src/components/StlRetrofitWorkflow.tsx`
  - STL 改底适配模板专用界面
- `src/hooks/useModelGenerator.ts`
  - Worker 通信、生成状态、导出状态
- `src/workers/model.worker.ts`
  - 真正执行几何生成与 STL / 3MF 序列化
- `src/lib/gridfinity/base.ts`
  - 基础外壳、逐格脚位、磁铁孔、内部底板基准
- `src/lib/gridfinity/templates.ts`
  - 模板 schema、字段定义、模板注册与 build 入口
- `src/lib/gridfinity/genericShapeCavity.ts`
  - 参数化型腔盒的固定旋转解析、排列方式求解与独立型腔建模
- `src/lib/gridfinity/memoryCard.ts`
  - 内存卡托盘自动尺寸推荐与排布
- `src/lib/gridfinity/photoOutline.ts`
  - 照片轮廓识别、校准与排布
- `src/lib/gridfinity/stlCavityBin.ts`
  - STL 型腔收纳求解与建模
- `src/lib/gridfinity/stlRetrofit.ts`
  - STL 改底适配求解与建模

## 5. 当前几何约定

当前实现采用社区常见 Gridfinity 尺寸约定：

- XY 节距：`42mm`
- 高度单位：`7mm`
- 单元外轮廓：`41.5mm`
- 底部脚位高度：`4.75mm`
- 磁铁孔：`6 x 2mm`

重要实现约定：

- 多格 bin 的底部按 `gridX * gridY` 逐格生成脚位，不是整块大脚
- `floorThickness` 表示“底脚之上的内部底板厚度”
- 参数化型腔盒、照片轮廓、STL 型腔收纳都是标准开口盒体，不做封顶实心块
- 参数化型腔盒中的多个 cavity 默认居中排布，并且各自独立开口到顶面

## 6. 当前模板状态

### 通用收纳盒

- 当前已回归为纯隔板模板
- 支持 `X / Y / Z` 三向内部实体厚度
- 支持 `X / Y` 分仓数量
- 支持隔板厚度、隔板高度、隔板位置
- 支持标签沿和磁铁孔

### 参数化型腔盒

- 模板 id：`parametric-cavity-bin`
- 支持 `rectangle / rounded-rectangle / circle / capsule`
- 支持数量、自动排布、固定尺寸校验和固定 `X / Y / Z` 手动旋转
- 支持 `x-first / y-first` 两种排列方式
- 支持手动点击“生成图形”，避免调参时每次都重算
- 支持单件复制 / 粘贴 / 粘贴新增
- 形状 `label` 继续用于自动命名，但界面不再允许手动编辑名称

### 内存卡托盘

- 已升级为 V2
- 支持 `microSD 极限收纳`、`SD 紧凑收纳`、`混合收纳`
- 自动推荐最小 `gridX / gridY / heightUnits`
- 支持抓取槽、标签区、固定外部尺寸与高级参数折叠

### 照片轮廓收纳

- 支持上传照片、L 形标尺校准、关键点拖拽修正、自动外部尺寸搜索
- 仍缺“取物凹槽”和独立图像识别 Worker

### STL 型腔收纳

- 支持导入 STL、90° 步进旋转、自动推荐尺寸、真实 STL 负形布尔

### STL 改底适配

- 支持导入 STL、90° 步进旋转、自动推荐占位
- 最终结果是标准矩形 Gridfinity 实体，不是型腔盒

## 7. 本地开发与发布

### Windows 本地开发

```powershell
.\scripts\start-dev.bat
```

或者：

```powershell
npm install
npm run dev
```

### Linux 云服务器发布

```bash
chmod +x ./scripts/build-release.sh
./scripts/build-release.sh
```

直接输出到部署目录：

```bash
DEPLOY_ROOT=/var/www/gridfinity-generator ./scripts/build-release.sh
```

## 8. 最近验证状态

最近一轮修改记录：

- 参数面板 V2 与超宽屏适配已落地，生成器左栏改为分段式参数面板，并补齐 `1600px / 1920px` 断点
- 参数化型腔盒移除自动旋转与姿态限制开关，改为固定 `X / Y / Z` 手动旋转
- 参数化型腔盒新增 `arrangementMode`，支持 `X -> Y -> Z` 与 `Y -> X -> Z` 两种排列方式
- 生成器摘要区与手动生成流程已同步到新的参数语义
- 模板切换改为按 `templateId` 重挂载，切模板时不再依赖手动刷新
- 导出链路已扩展为 `STL + 3MF` 双出口，并保持纯前端 Worker 架构

最近一次已验证通过：

- `npm run test:run -- src/lib/gridfinity/parametricCavityBin.test.ts`
- `npm run test:run -- src/pages/GeneratorPage.test.tsx src/lib/gridfinity/generation.test.ts`
- `npm run build`

当前这轮重点验证覆盖：

- 参数化型腔盒的固定旋转、排列方式、独立型腔与手动生成流程
- 模板切换无需刷新、参数化型腔卡片问号提示与 3MF 导出
- 生成器页摘要区与参数面板联动
- 构建链路与导出主流程基本可用

## 9. 已知问题与风险

- `three.js` 预览分包仍有一个 chunk 略高于 Vite 默认 `500kB` 告警阈值，但不阻塞功能
- 当前 Gridfinity 结构属于“社区兼容优先”的实现，不是对某一原始标准的逐细节复刻
- 图像识别仍在主线程执行，复杂图片时会影响交互流畅度
- 目前仍不支持 STEP、项目保存或切片预设联动

## 10. 下一步建议

1. 按开放需求继续推进钳类模板 V2
2. 继续补齐照片轮廓收纳的取物凹槽和识别 Worker
3. 继续微调参数面板的移动端紧凑布局与短标签治理
4. 增加项目参数保存 / 导入导出 JSON
5. 继续评估切片友好配置或更多工程格式

## 11. 交接提醒

如果修改几何核心，请至少同步检查：

- `src/lib/gridfinity/base.ts`
- `src/lib/gridfinity/templates.ts`
- `src/lib/gridfinity/generation.test.ts`
- `src/lib/gridfinity/genericBin.test.ts`
- `src/lib/gridfinity/parametricCavityBin.test.ts`

如果修改参数 UI，请至少同步检查：

- `src/components/ParameterPanel.tsx`
- `src/components/AxisInspectorGroup.tsx`
- `src/components/FieldHint.tsx`
- `src/index.css`
