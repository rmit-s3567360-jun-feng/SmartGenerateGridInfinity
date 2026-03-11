# Next Phase Spec

更新时间：2026-03-11

这份文档把“需求想法”拆成可以直接开发的规格，同时保留已完成实现的设计依据。当前状态：

- 内存卡模板 V2：已完成首版实现
- 钳类模板 V2：待实现

默认边界：

- 继续使用纯前端架构
- 不引入后端
- 不改变当前 `/generator/:templateId` 的主路由模式
- 继续沿用 `TemplateDefinition + zod + Worker`

## 1. 内存卡模板 V2

实现状态：

- 已于 2026-03-11 完成首版实现
- 当前代码入口：
  - `src/lib/gridfinity/memoryCard.ts`
  - `src/lib/gridfinity/templates.ts`
  - `src/pages/GeneratorPage.tsx`
  - `src/components/ParameterPanel.tsx`
- 本节继续保留，作为后续收紧排布策略和增加更多卡型时的约束来源

### 1.1 目标

目标不是让用户自己手工摆槽位，而是：

- 用户只输入少量核心信息
- 系统自动推荐尽量小的外部尺寸
- 在保证可拿取的前提下尽量压缩体积

排序优先级：

1. 装得下指定数量
2. 外部体积最小
3. 占地面积最小
4. 拿取体验合理

### 1.2 模式设计

保留单一路由模板，但模板内部支持三种模式：

- `micro-sd-compact`
- `sd-compact`
- `mixed`

含义：

- `micro-sd-compact`
  - 用于大量 microSD 的极限收纳
- `sd-compact`
  - 用于标准 SD 卡
- `mixed`
  - 用于 SD + microSD 混合收纳，自动分区

### 1.3 参数字段

#### 核心字段

- `mode`
  - 类型：`'micro-sd-compact' | 'sd-compact' | 'mixed'`
  - 默认：`'micro-sd-compact'`
- `quantity`
  - 类型：整数
  - 仅 `micro-sd-compact` 和 `sd-compact` 使用
  - 默认：
    - microSD: `12`
    - SD: `6`
- `sdCount`
  - 类型：整数
  - 仅 `mixed` 使用
  - 默认：`4`
- `microSdCount`
  - 类型：整数
  - 仅 `mixed` 使用
  - 默认：`8`
- `enableLabelArea`
  - 类型：布尔
  - 默认：`false`
- `enableGripCutout`
  - 类型：布尔
  - 默认：`true`
- `lockOuterSize`
  - 类型：布尔
  - 默认：`false`

#### 锁定外部尺寸字段

仅当 `lockOuterSize=true` 时生效：

- `gridX`
  - 默认：`2`
- `gridY`
  - 默认：`1`
- `heightUnits`
  - 默认：
    - microSD: `2`
    - SD: `3`
    - mixed: `3`

#### 高级字段

- `wallThickness`
  - 默认：`1.8`
- `floorThickness`
  - 默认：`1.8`
- `slotTolerance`
  - 默认：
    - microSD: `0.45`
    - SD: `0.55`
- `minGripMargin`
  - 默认：
    - microSD: `1.2`
    - SD: `2.0`
- `magnetHoles`
  - 默认：`true`

### 1.4 UI 要求

- 默认只显示核心字段
- 高级字段收进“高级设置”
- 若系统自动推荐外部尺寸，必须显示：
  - 推荐 `gridX`
  - 推荐 `gridY`
  - 推荐 `heightUnits`
- 若用户锁定尺寸，显示“当前为固定外部尺寸”

### 1.5 自动尺寸推荐策略

如果 `lockOuterSize=false`：

- 搜索候选尺寸：
  - `gridX: 1..4`
  - `gridY: 1..4`
  - `heightUnits: 2..4`
- 对每组候选尺寸尝试排布
- 选择满足约束且体积最小的方案

排序策略：

1. 外部体积最小
2. 占地面积最小
3. 高度最小

### 1.6 排布策略

#### microSD

- 目标：极限密度
- 优先尝试：
  - 二维矩阵紧凑排布
  - 单向纵深排布
  - 单向横向排布
- 尽量共享抓取通道，减少单卡独立大缺口

#### SD

- 目标：紧凑 + 可拿取
- 优先采用二维矩阵
- 每张卡前方必须预留最小抓取区
- 若开启标签区，标签区和抓取区不得冲突

#### mixed

- 目标：自动分区 + 总体积最小
- 必须自动尝试：
  - 左右分区
  - 前后分区
- 取更紧凑且抓取更合理的结果

### 1.7 几何策略

应从“简单浅托盘”升级为：

1. 先确定最小外部 Gridfinity 尺寸
2. 生成基础 bin
3. 生成上层托盘平面
4. 切出卡槽
5. 按模式切出共享抓取区或分区

关键约束：

- 共享抓取区优先于每槽独立大切口
- 混合模式应自动生成分区边界或分区间距
- 锁定外部尺寸装不下时必须报错，不允许静默退化

### 1.8 校验规则

- `quantity >= 1`
- `sdCount >= 0`
- `microSdCount >= 0`
- mixed 模式下至少一类卡数量大于 0
- `wallThickness >= 1.2`
- `floorThickness >= 1.2`
- `slotTolerance` 需落在合理范围
- 锁定尺寸时若装不下，报错

### 1.9 验收标准

- 用户只输入卡型和数量时即可直接得到可用模型
- 自动布局结果应明显优于当前版本的默认占用体积
- mixed 模式必须自动完成分区
- 锁定尺寸装不下时必须给出明确错误

### 1.10 测试用例

- `microSD x 12` 自动推荐尺寸应小于等于当前默认体积
- `SD x 6` 必须保留抓取空间
- `mixed(sd=4,micro=8)` 必须生成分区
- `1x1x2` 锁定尺寸装不下时必须报错
- 关闭标签区后外部体积不应变大

### 1.11 开发任务

1. 已完成：新增内存卡 V2 参数类型
2. 已完成：参数面板支持模式切换、条件字段和高级设置
3. 已完成：自动尺寸推荐搜索器
4. 已完成：内存卡模板建模逻辑重写
5. 已完成：推荐说明、固定尺寸提示和失败态
6. 已完成：体积最优、混合分区和锁定尺寸失败测试

## 2. 钳类模板 V2

### 2.1 目标

目标不是某一把钳子的专用槽，而是：

- 用一个通用模板覆盖大部分小型钳类工具
- 用户只改少数核心参数就能得到可用模型

### 2.2 模板定位

建议将当前“钳子收纳”升级为：

- `pliers-universal`

适用范围：

- 尖嘴钳
- 斜口钳
- 小型平口钳
- 类似外形的手持夹持工具

### 2.3 参数字段

#### 核心字段

- `toolCount`
  - 默认：`3`
- `maxToolWidth`
  - 默认：`18`
- `maxToolThickness`
  - 默认：`10`
- `insertLength`
  - 默认：`56`
- `frontOpeningWidth`
  - 默认：`16`

#### 次核心字段

- `handleLift`
  - 默认：`4`
- `retentionStyle`
  - 类型：`'open' | 'guided' | 'snug'`
  - 默认：`'guided'`

#### 高级字段

- `gridX`
- `gridY`
- `heightUnits`
- `wallThickness`
- `floorThickness`
- `spacing`
- `magnetHoles`

建议默认：

- `gridX=2`
- `gridY=2`
- `heightUnits=4`
- `wallThickness=2`
- `floorThickness=2.2`
- `spacing=8`
- `magnetHoles=true`

### 2.4 UI 要求

- 默认界面只显示核心字段和 `retentionStyle`
- 高级字段折叠
- 需要显示一段说明：
  - 当前模板按最大包络尺寸生成
  - 适合多数小型钳类
  - 如遇异形工具，优先调宽度、厚度、插入长度

### 2.5 几何策略

当前版本过于接近矩形槽。V2 改为：

1. 前部导入区
   - 更宽
   - 更容易放入
2. 中部导向区
   - 根据最大宽度 / 厚度形成主约束
3. 后部限位区
   - 防止工具插入过深
   - 保持摆放一致

建议槽道形态：

- XY 平面“前宽后紧”
- Z 方向允许轻微托举
- `retentionStyle` 控制导向强度

### 2.6 参数到几何映射

- `maxToolWidth`
  - 控制导向区宽度
- `maxToolThickness`
  - 控制开槽深度和垂向包络
- `insertLength`
  - 控制支撑长度
- `frontOpeningWidth`
  - 控制前部入口宽度
- `handleLift`
  - 控制后部托举
- `retentionStyle`
  - `open`: 宽松
  - `guided`: 默认
  - `snug`: 更贴合，但需更保守容差

### 2.7 自动尺寸推荐

若未锁定外部尺寸：

- 自动推导 `gridX / gridY / heightUnits`
- 优先级：
  1. 装得下
  2. 打印稳定
  3. 外部体积最小

### 2.8 校验规则

- `toolCount >= 1`
- `maxToolWidth >= 8`
- `maxToolThickness >= 4`
- `insertLength >= 20`
- `frontOpeningWidth >= maxToolThickness`
- `frontOpeningWidth <= maxToolWidth * 1.6`
- `retentionStyle='snug'` 时提高容差下限
- 外部尺寸不足时直接报错

### 2.9 验收标准

- 用户只调整 4 到 5 个核心参数即可得到可用模型
- 同一模板能覆盖至少 3 类常见钳型
- 相比当前矩形槽版本，更容易放入且更稳定
- 不产生明显薄壁或难打印结构

### 2.10 测试用例

- 小型尖嘴钳参数必须可用
- 斜口钳参数必须可用
- 三件工具并排时需保持足够间距
- `open` 与 `snug` 模式几何必须明显不同
- 锁定过小外部尺寸必须报错

### 2.11 开发任务

1. 重定义钳类参数结构
2. 调整 UI 字段分层
3. 实现渐缩导向槽 + 后限位几何
4. 接入自动尺寸推荐
5. 增加说明文案与失败态
6. 增加典型钳型测试

## 3. 推荐实施顺序

1. 先做内存卡模板 V2
2. 抽出可复用的自动尺寸推荐能力
3. 再做钳类模板 V2

## 4. 本轮不做

- 自由拖拽布局编辑器
- CAD 级任意自由布尔建模
- 用户账号和云端保存
- 后端计算队列
- 3MF / STEP 导出

## 5. 对应代码入口

优先改这些文件：

- `src/lib/gridfinity/types.ts`
- `src/lib/gridfinity/templates.ts`
- `src/components/ParameterPanel.tsx`
- `src/pages/GeneratorPage.tsx`
- `src/lib/gridfinity/generation.test.ts`
