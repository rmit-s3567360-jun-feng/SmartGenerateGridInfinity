# Development Context

更新时间：2026-03-11

补充规格文档：

- `docs/NEXT_PHASE_SPEC.md`
- `docs/TASK_BREAKDOWN.md`

## 1. 项目定位

这是一个纯前端的 Gridfinity 参数化模型生成网站，目标是：

- 在浏览器里调整参数
- 生成符合 Gridfinity 常见社区规格的收纳模型
- 实时预览 3D 网格
- 导出可 3D 打印的 STL

当前版本不做账号、模板云端保存、社区分享、底板或盖子生态。

## 2. 当前已实现范围

- 首页：模板入口、能力说明、Gridfinity 规格说明
- 生成器页：`/generator/:templateId`
- 4 个模板：
  - 通用收纳盒
  - 螺丝刀收纳
  - 内存卡托盘
  - 钳子收纳
- 参数表单 + `zod` 校验
- Web Worker 内部几何生成
- `three.js` 预览
- 二进制 STL 导出
- Windows 本地一键启动脚本
- Linux 云服务器构建发布脚本

## 3. 技术栈

- 前端：React 19 + TypeScript + Vite
- 路由：React Router
- 参数校验：zod
- 几何建模：`@jscad/modeling`
- STL 导出：`@jscad/stl-serializer`
- 3D 预览：`three.js`
- 测试：
  - Vitest
  - Testing Library
  - Playwright

## 4. 核心文件与职责

- `src/App.tsx`
  - 路由入口，生成器页懒加载
- `src/pages/HomePage.tsx`
  - 首页与模板入口
- `src/pages/GeneratorPage.tsx`
  - 参数页、模板切换、导出按钮、规格摘要
- `src/hooks/useModelGenerator.ts`
  - Worker 通信、生成状态、导出状态
- `src/workers/model.worker.ts`
  - 真正执行几何生成与 STL 序列化
- `src/lib/gridfinity/spec.ts`
  - Gridfinity 基础尺寸、单位换算、单元中心点
- `src/lib/gridfinity/base.ts`
  - 基础 bin 外壳、底部逐格脚位、磁铁孔、内部 floor 基准
- `src/lib/gridfinity/memoryCard.ts`
  - 内存卡 V2 的自动尺寸推荐、混合分区和卡槽排布求解
- `src/lib/gridfinity/templates.ts`
  - 4 个模板的参数 schema、字段定义、几何生成逻辑
- `src/lib/gridfinity/generation.ts`
  - 模板调度、mesh 数据生成、STL 导出入口
- `scripts/start-dev.bat`
  - Windows 本地一键启动
- `scripts/build-release.sh`
  - Linux 服务器构建并输出发布包

## 5. 当前几何约定

当前实现采用社区常见 Gridfinity 尺寸约定：

- XY 节距：`42mm`
- 高度单位：`7mm`
- 单元外轮廓：`41.5mm`
- 底部脚位高度：`4.75mm`
- 磁铁孔：`6 x 2mm`

重要实现约定：

- 多格 bin 的底部不是整块脚，而是按 `gridX * gridY` 逐格生成脚位
- `floorThickness` 表示“底脚之上的内部底板厚度”
- 通用收纳盒、内存卡托盘、钳子模板现在都是真正开口的，不再是封顶实心块
- 螺丝刀模板保留顶部板，但孔位与内部腔体已经连通

## 6. 当前模板状态

### 通用收纳盒

- 基于开口 cavity
- 支持 X/Y 分仓
- 支持标签 lip
- 支持磁铁孔

### 螺丝刀收纳

- 内部留空
- 顶部带倾角孔位
- 自动压缩孔距以适配箱体

### 内存卡托盘

- 已升级为 V2
- 支持 `microSD 极限收纳`、`SD 紧凑收纳`、`混合分区`
- 自动搜索最小可用 `gridX / gridY / heightUnits`
- 默认 `microSD x 12` 推荐为 `2 x 1 x 2`
- 支持抓取缺口、标签区、固定外部尺寸与高级参数折叠

### 钳子收纳

- 顶部开槽
- 前侧开口
- 自动压缩槽距以适配箱体

## 7. 本地开发与发布

### Windows 本地开发

直接运行：

```powershell
.\scripts\start-dev.bat
```

或者：

```powershell
npm install
npm run dev
```

### Linux 云服务器发布

推荐 Linux + Nginx 静态部署。

构建并生成发布包：

```bash
chmod +x ./scripts/build-release.sh
./scripts/build-release.sh
```

构建后直接复制到部署目录：

```bash
DEPLOY_ROOT=/var/www/gridfinity-generator ./scripts/build-release.sh
```

脚本会输出：

- `release/gridfinity-generator.tar.gz`
- `release/nginx.conf`

## 8. 当前验证状态

最近一次已经验证通过：

- `npm run lint`
- `npm run build`
- `npm run test:run`
- `npm run e2e`

测试覆盖包括：

- Gridfinity 基础尺寸换算
- 多格底脚布局
- 模板生成后必须显著小于基础实心体积，防止回归成“实心块”
- 首页与生成器页基本渲染
- Playwright 冒烟访问

## 9. 已知问题与风险

- `three.js` 预览分包仍有一个 chunk 略高于 Vite 默认 `500kB` 告警阈值，但不阻塞功能
- 当前底部结构已经是逐格脚位，但仍属于“社区兼容优先”的简化实现，不是对原始 Gridfinity 每个细节的完全复刻
- 磁铁孔目前按逐格脚位阵列生成；如果后续要严格对齐某一套官方或特定社区标准，需要单独校准
- 目前只导出 STL，不支持 3MF、STEP 或项目保存

## 10. 近期需求深化（部分未实现）

下面两项里，内存卡 V2 已经落地；钳类 V2 仍是下一轮模板升级的优先输入。

### 10.1 内存卡模板升级目标

实现状态：

- 已于 2026-03-11 完成首版实现
- 本节保留为设计依据，便于后续继续微调尺寸策略或扩展更多卡型

当前问题：

- 当前内存卡模板只支持比较简单的浅托盘 + 卡槽逻辑
- 用户仍要自己决定较多排布参数
- 没有把“占用体积最小”作为第一优先级

新的需求目标：

- 内存卡模板要优先追求“在满足收纳数量的前提下，占用体积最小”
- 用户不应该先手动猜 `gridX / gridY / slotPitch`，系统应优先自动给出最紧凑方案
- 模板类型要更贴近真实使用场景，而不是只有一个泛化托盘

建议拆成的模板能力：

1. `microSD 极限收纳`
   - 面向大量 microSD
   - 以最小体积优先
   - 默认应自动计算最紧凑排列
2. `SD 卡收纳`
   - 面向标准 SD
   - 兼顾紧凑与手指抓取
3. `混合卡收纳`
   - 至少支持 `SD + microSD`
   - 自动分区，而不是要求用户手动拼布局

建议的交互模式：

- 默认只暴露少量核心参数：
  - 卡类型
  - 数量
  - 是否需要标签区
  - 是否需要抓取缺口
  - 是否锁定外部尺寸
- 如果用户不锁定外部尺寸，系统自动推荐最小 `gridX / gridY / heightUnits`
- 高级参数如 `slotPitch / wallThickness / floorThickness` 收到“高级设置”里

建议的几何与排布策略：

- 将“最小体积”定义为第一排序目标：
  - 先最小化外部体积
  - 再最小化占地面积
  - 最后才考虑操作舒适度
- microSD 默认优先采用更高密度的竖向或紧凑排列
- SD 默认优先采用紧凑二维排布，但必须保留最小抓取空间
- 混合收纳时，优先按卡型自动分区，不要求用户自己布置

建议的验收标准：

- 在相同数量下，自动模式生成的外部体积不能明显大于人工调参结果
- 用户只改“卡类型 + 数量”时，也能得到可打印、可拿取的结果
- 锁定外部尺寸时，如果装不下，应明确报错，而不是生成低质量或重叠模型

### 10.2 钳子模板升级目标

当前问题：

- 当前钳子模板本质上仍接近固定矩形槽
- 对真实钳子、剪钳、尖嘴钳等不同外形的适配不够通用
- 用户需要理解较多几何参数，才能勉强调整到可用

新的需求目标：

- 模板应尽量通用，覆盖“小型钳子类工具”的大多数情况
- 使用者只需要调整几个核心参数，就能把自己的物品放进去
- 模板不应过度绑定某一个具体钳型

建议的产品定位：

- 将当前“钳子收纳”升级为更通用的“钳类 / 手持夹持工具收纳”
- 默认适配：
  - 尖嘴钳
  - 斜口钳
  - 小型平口钳
  - 类似外形的小工具

建议的核心参数收敛为：

- 数量
- 最大宽度
- 最大厚度
- 插入长度
- 前部开口宽度

高级参数才允许进入：

- 工具间距
- 底厚
- 壁厚
- 倾角或限位结构

建议的几何策略：

- 不再只是统一矩形槽，而应改为更通用的“渐缩或限位型槽道”
- 槽道前部应允许较容易放入，后部负责限位
- 对用户来说，核心是描述“工具最大包络尺寸”，而不是手工设计槽道形状
- 同一模板应尽量通过少数参数覆盖多种钳型，而不是继续拆太多钳子子模板

建议的验收标准：

- 用户只调整 4 到 5 个核心参数，就能得到明显可用的模型
- 相同模板应能覆盖多种钳类，不需要每种工具单独做一套模板
- 几何不能出现明显悬空、过薄或难打印的结构

## 11. 后续开发建议

优先级最高的下一步建议：

1. 按 10.2 重做钳类模板，收敛为少数核心参数
2. 继续微调内存卡 V2，例如增加更多卡型、优化极限密度和标签区策略
3. 把底部脚位进一步细化为更接近标准的台阶/倒角/配合面
4. 给模板增加更强的参数约束和可视化错误提示
5. 增加项目参数保存 / 导入导出 JSON
6. 考虑 3MF 导出或切片友好配置

## 12. 交接提醒

后续如果修改几何核心，请至少同步检查这几类文件：

- `src/lib/gridfinity/base.ts`
- `src/lib/gridfinity/templates.ts`
- `src/lib/gridfinity/base.test.ts`
- `src/lib/gridfinity/generation.test.ts`

后续如果修改部署流程，请同步更新：

- `README.md`
- `scripts/start-dev.bat`
- `scripts/build-release.sh`
