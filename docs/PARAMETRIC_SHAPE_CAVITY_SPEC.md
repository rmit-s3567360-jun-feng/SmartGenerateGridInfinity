# 参数化型腔盒模板 V1 规格

更新时间：2026-03-22

状态：`已实现`

这份文档用于冻结“参数化型腔盒模板 V1”的当前实现边界。后续如果继续扩展，应以本文件为基线，而不是回退到早期“并入 generic-bin”方案。

## 0. 本轮修改记录

- 移除旧的自动旋转与可用姿态限制开关，所有形状只保留固定 `rotationX / rotationY / rotationZ`
- 新增全局 `arrangementMode`，支持 `x-first` 与 `y-first` 两种排列方式
- 求解器改为仅根据固定旋转推导最终姿态，不再自动在平放与立放之间切换
- 工作流界面与摘要区同步切换为“固定旋转 + 排列方式”语义，并补齐对应回归测试
- 模板切换改为按 `templateId` 重挂载，切换时不再依赖手动刷新
- 形状 `label` 继续保留在数据结构中，但界面不再提供手动名称输入
- 形状卡片标题、形状类型、数量、尺寸与固定旋转都补齐悬浮问号提示

## 1. 目标与范围

目标不是把当前模板做成自由 CAD 编辑器，而是：

- 提供独立模板 `parametric-cavity-bin`
- 让用户输入一组基础参数化形状和数量后，系统自动规划排列
- 自动生成标准 Gridfinity 外壳内的多个独立型腔
- 优先解决“多个基础形状 + 手动盒体尺寸 + 用户可通过固定旋转显式切换姿态”的高频需求

V1 明确不做：

- 任意多边形、SVG、照片轮廓或 STL 输入
- 手工拖拽摆位、手工指定孔位坐标
- 同一条 entry 内的混合姿态求解
- 合并成长槽、共槽道、阶梯槽等自由型腔形式

## 2. 模板定位

- 模板 id：`parametric-cavity-bin`
- 路由：继续沿用 `/generator/:templateId`
- `generic-bin` 已回归纯隔板模板，不再承担型腔模式切换
- 当前模板走独立工作流组件，不再复用 `generic-bin` 内部的 `layoutMode`
- 几何生成与导出仍沿用当前 `TemplateDefinition + zod + Worker` 体系
- 该模板默认采用“先调参数，再手动点击生成图形”的交互，避免每次改值都触发重算

## 3. 接口与类型冻结

### 3.1 `ParametricCavityBinParams`

当前模板独立使用 `ParametricCavityBinParams`，至少包含以下字段：

- `gridX`
- `gridY`
- `heightUnits`
- `wallThickness`
- `floorThickness`
- `magnetHoles`
- `arrangementMode`
- `xyClearance`
- `zClearance`
- `interItemGap`
- `shapeEntries`

约束说明：

- 盒体尺寸始终由 `gridX / gridY / heightUnits` 手动指定，不再提供 `sizeMode`
- `shapeEntries` 至少包含 1 条形状定义
- `label` 继续保留在 entry 结构里，但当前只用于系统自动命名、复制 / 粘贴和摘要语义
- `generic-bin` 不再持有上述型腔专用字段，已收口为隔板参数

### 3.2 形状相关类型

- `GenericShapeKind`
  - `'rectangle' | 'rounded-rectangle' | 'circle' | 'capsule'`
- `GenericShapeEntry`
  - `id: string`
  - `kind: GenericShapeKind`
  - `label: string`
  - `quantity: number`
  - `width: number`
  - `depth: number`
  - `height: number`
  - `cornerRadius?: number`
  - `diameter?: number`
  - `length?: number`
  - `rotationX / rotationY / rotationZ: QuarterTurn`
- `PlacedShapeInstance`
  - 表示单个型腔实例的最终姿态和摆放结果
- `ShapeCavityPlan`
  - 表示自动求解输出的推荐尺寸、姿态、实例列表、warnings 和摘要信息

### 3.3 冻结规则

- 同一条 `shape entry` 的全部数量必须共用一个最终姿态
- 若用户想让同一种形状混合多种姿态，必须通过新增第二条 entry 表达
- V1 只支持基础参数化形状，不支持文件导入或手工摆位

## 4. 输入模型

### 4.1 支持的基础形状

- `rectangle`
  - 使用 `width / depth / height`
- `rounded-rectangle`
  - 使用 `width / depth / height / cornerRadius`
- `circle`
  - 使用 `diameter / height`
  - 内部按 `width = depth = diameter` 归一化
- `capsule`
  - 使用 `length / diameter / height`
  - 内部按 `width = length`、`depth = diameter` 归一化

### 4.2 校验规则

- 每条 `shape entry` 必须有 `quantity >= 1`
- 全部尺寸必须为正数
- `rounded-rectangle` 的 `cornerRadius` 不能超过短边一半
- `capsule` 的 `diameter` 不能超过 `length`

### 4.3 数量与实例展开

- 求解前先按 `quantity` 展开为多个待摆放实例
- 实例共享该 entry 的几何尺寸、清隙规则和最终姿态
- V1 不会把多个重复件自动合并成长槽

## 5. 固定旋转语义

### 5.1 对外暴露的旋转输入

- 每条 `shape entry` 直接提供 `rotationX / rotationY / rotationZ`
- 取值固定为 `0 / 90 / 180 / 270` 的 quarter-turn
- 当前版本不再提供“自动姿态优化”或姿态开关

### 5.2 内部求解规则

- 求解器按用户给定的 `rotationX / rotationY / rotationZ` 推导最终姿态
- 推导结果仍可能落到：
  - `flat`
  - `flat-rotated`
  - `vertical-on-width`
  - `vertical-on-depth`
- 若固定旋转后的 footprint 或高度无法容纳当前盒体，必须直接报错

### 5.3 当前立放边界

- 立放由用户通过固定旋转显式指定，而不是系统自动切换
- 立放后会重新映射外部占位与 cavity 高度
- 立放型腔仍需从顶部开口，且结果必须保持为标准开口盒体

## 6. 自动排布与固定尺寸校验

### 6.1 尺寸输入边界

- 当前不再自动搜索最小外部尺寸
- 用户直接输入当前盒体的 `gridX / gridY / heightUnits`
- 求解器只在当前盒体尺寸内验证是否能容纳当前布局

### 6.2 排布规则

- 先根据每条 entry 的固定 XYZ 旋转推导最终姿态
- 全部实例按最终姿态换算为 footprint 后做确定性 2D 排布
- `arrangementMode = 'x-first'` 时按 `X -> Y -> Z` 排列
- `arrangementMode = 'y-first'` 时按 `Y -> X -> Z` 排列
- 排布时把 `xyClearance` 与 `interItemGap` 一并纳入约束
- 相邻型腔之间不得小于 `interItemGap`
- 排布完成后会根据整体占用边界再做一次居中偏移

### 6.3 高度约束

候选解必须满足：

- `cavityBottomZ = footHeight + floorThickness`
- `totalHeight >= cavityBottomZ + max(cavityHeight) + zClearance`
- 若由于 Gridfinity 高度单位对齐带来额外顶部余量，允许通过 warning 提示

### 6.4 失败规则

以下情况必须明确失败：

- 没有任何 entry
- 任一 entry 尺寸非法
- 任一 entry 的固定旋转结果无法生成有效型腔
- 当前固定尺寸装不下
- 当前手动盒体尺寸超出 V1 允许范围

## 7. 几何规则

### 7.1 盒体规则

- 外部盒体继续使用标准 `createBaseBinSolid`
- 本模板使用标准开口盒体，不生成分仓隔板
- `wallThickness`、`floorThickness`、`magnetHoles` 沿用现有通用语义

### 7.2 型腔规则

- 每个展开实例都必须生成一个独立 cavity
- 全部 cavity 从顶部开口贯通到盒口
- 平放型腔保持自身轮廓贯通，不再统一补成矩形喉口
- `rectangle` 在应用 XY 清隙后仍保持直角轮廓，不额外圆角化
- cavity 的 Z 向底部基准统一从 `cavityBottomZ` 开始

### 7.3 不同形状的 cavity 轮廓

- `rectangle`
  - 用矩形 profile 拉伸
- `rounded-rectangle`
  - 用圆角矩形 profile 拉伸
- `circle`
  - 用圆形 profile 拉伸
- `capsule`
  - 用胶囊 profile 拉伸

### 7.4 清隙和尺寸换算

- `xyClearance` 作用在 cavity footprint，不放大整个外壳
- `zClearance` 只作用在顶部余量，不增加底部悬空
- `interItemGap` 表示 cavity 之间保留的实体距离，不等同于 `xyClearance`

## 8. UI 与摘要要求

### 8.1 参数面板

该模板使用独立工作流，不再提供 `layoutMode` 切换。当前界面显示：

- `arrangementMode`
- `gridX / gridY / heightUnits`
- `wallThickness`
- `floorThickness`
- `xyClearance`
- `zClearance`
- `interItemGap`
- `shapeEntries` 编辑器

界面约束：

- 数字输入统一为手动输入，不显示上下箭头
- `X / Y / Z` 参数采用 Unity Inspector 风格分组
- 字段标题尽量缩短并保持单行，完整解释收口到悬浮提示
- 左侧参数栏采用紧凑布局，减少标题换行和按钮挤压

### 8.2 形状录入

- 首次进入模板且列表为空时，自动插入 1 条默认矩形 entry
- 形状卡片标题显示系统自动命名的 `label`
- `label` 不再提供手动文本输入，但复制 / 粘贴 / 复制一份会继续沿用或追加该标签
- 支持单件复制 / 粘贴 / 粘贴新增
- 每条 `shape entry` 直接编辑固定 `X / Y / Z` 旋转
- 形状类型、数量、尺寸和固定旋转均通过 `FieldHint` 提供悬浮说明
- 草稿态修改参数时不立即重算，只有点击“生成图形”才更新预览

### 8.3 摘要区

摘要区至少显示：

- 当前外部尺寸
- 当前内部有效尺寸
- 当前 `Gridfinity` 占位
- 总 cavity 数量
- 当前排列方式
- 草稿是否尚未生成

## 9. Warnings 与错误信息

应至少支持以下 warning：

- 已允许顶部露出一定高度，以适配当前盒高
- 当前盒体顶部仍有额外余量

应至少支持以下错误：

- 请至少添加一种形状
- 当前形状参数无效
- 当前姿态或旋转设置无法生成有效型腔
- 固定外部尺寸不足以容纳当前布局
- 当前输入超出首版搜索范围

## 10. 验收标准

- 用户只输入基础形状和数量时，系统可以生成可用模型
- 在当前手动盒体尺寸下，系统可以明确判断“能生成”或“装不下”
- 支持用户通过固定旋转切换到立放姿态的典型场景
- 切换 `arrangementMode` 后，排布结果必须随之变化
- 最终结果必须是标准 Gridfinity 盒体内的多个独立型腔，而不是一个合并大槽

## 11. 必测场景

- `5` 个相同矩形在默认旋转下装不下，但手动改成立放后可装下
- 同一组输入在 `x-first / y-first` 两种排列方式下，实例排布方向应可观察到差异
- 多种基础形状能在同一盒体中生成多个独立 cavity
- `generic-bin` 与 `parametric-cavity-bin` 的参数状态互不污染
- 从其他模板点击切回 `parametric-cavity-bin` 时，不需要刷新即可看到正确工作流
- 手动生成模式下，草稿修改不会立即触发重算
- 空 `shapeEntries`、非法圆角半径、固定旋转导致无法装入都必须明确报错
- 矩形型腔从底到顶保持直角轮廓，平放圆角型腔到顶面保持轮廓连续

## 12. 后续版本边界

如果后续要支持以下能力，应单独立项为 V2 或独立模板，而不是直接塞进本规格：

- 任意多边形或可编辑轮廓
- 形状文件导入
- 手工拖拽摆位
- 同一条 entry 的混合姿态
- 合并槽道、抓取缺口、复杂导向结构
