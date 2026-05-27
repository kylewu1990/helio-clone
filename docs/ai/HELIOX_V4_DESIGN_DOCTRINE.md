# Heliox v4 Design Doctrine

> 本文是 v4 产品形态与设计语言的**唯一**指导文件。下一个 Claude 必须读完再动手。
> 参考资料是**用户用 AI 工具为 helio-clone v4 量身生成的草稿,属于本项目自有产物**:
> - `reference/v4-opendesign-screens/` — 10 桌面 + 4 移动截图 + 用户直觉笔记
> - **`reference/v4-source/index.html`** — 完整 vanilla HTML+CSS+JS 单页实现(3872 行,自包含,无外部 CDN)。**所有 OKLCH token / 卡片样式 / aurora-bar / surface-glow / glass 层 / 动效 keyframe 都在这里**,**直接抽进** `web/src/theme.css` / `web/src/index.css`
> 可以直接对齐:**色值 / 字号 / 留白 / 卡片骨架 / 动效 / 图标选用 / 文案口吻 / 视觉细节**,目标是让最终成品**视觉上尽量贴近截图**。
> 唯一约束:代码 / 注释 / 命名里不出现 "Open Design" / "od-" 等生成工具名(避免误判外部依赖)。其他命名以截图为准。

---

## 0. 使命与一句话定位

**使命**:根据 `reference/v4-opendesign-screens/` 截图,**完整复刻 UI + 跑通所有功能**。不要为"原创"硬写——大胆用 GitHub 开源项目(MIT / Apache 2.0 / BSD)当依赖或读源码学实现,见 `CURRENT_GOAL_PROMPT.md` "工程实施推荐"段的对照表。

**产品定位**:Heliox 是本地优先的"AI 公司指挥中心"。**人类老板管理一支 AI 团队,所有协作只在项目频道里发生**。

---

## 1. 产品形态(v4 校准 · Phase K + Q 务实修订)

**频道形态(Phase S 收紧修订)**:
- **项目频道(Project Channel,唯一正式协作场)** — 老板 + 1 个 AI 助理(单一负责制),全部正式协作在此发生。
- **私信(DM,老板↔单 AI · 历史轻协作)** — 仅 seed:demo 写入的 4 条预置 DM(Aria/Cypher/Foster/Marlow)。**不能 sidebar 主动新建**;创建 channel API 仍拒 `isDM=true`。
- **讨论频道(Discussion) — 已从 sidebar 删除(Phase S)**。理由:多 AI 在频道里互动产生混乱(没人知道在跟谁说话)。DB 里既有的 `strategy-q3` / `random` / `all-hands` 数据不破坏,只是 sidebar 不显示。
- **AI 助手作为资料卡** — 点 AI 名字进 `/agent/:id` profile 页,**不弹 DM 创建**。

## 1.5 单一 AI 负责制(Phase Q 校准)

**项目频道里只有 1 个 AI 助理 + 老板**。
- 派工后 = 该 AI 全权负责这个项目里所有任务。所有后续无 @ 消息默认归 ta。
- 想找别人帮忙 → **显式 @ 那位 AI**(只在该消息内有反应,不长期加入频道)。
- 这避免了 v3 痛点:多 AI 在频道里互相讨论,但**没人知道这条消息真正在跟谁说话**。

副作用(都是好事):
- maybeTriggerAssistants 的 pickResponders / pickAutoExecutor 路径几乎只剩 noop(频道里就 1 个 AI,没什么"选谁")
- 频道里 "active task → assignee 接住延续消息"(Phase P1)逻辑天然兼容,因为 assignee 100% 就是该频道唯一 AI
- AI 团队 sidebar 段的"在岗 8 个"概念改成"全局 AI 库,按项目按需指派"

**所有正式协作发生在项目频道**。AI 间互动通过在频道里 @ 完成。Agent profile 页只读。

带来的副作用(都是好事):
- v3 "任务跑到 DM"" DM 上下文混乱"等 bug 从源头消失(因为 DM 创建路径关闭)
- buildProjectContext 不再处理新建 DM 分支(seed 的 4 条只读消费)
- 用户认知一致:**频道 = 协作,资料 = 个人,既有 DM = 历史轻协作**

**为什么不严格 A(全删 DM 段):** 截图 `01-home.png` 里就有讨论/私信段,seed:demo 也真造了这些频道。**务实保留 = 视觉对齐截图 + 不引入混乱(无新 DM 创建路径)**。决策记录见 `docs/ai/current/V4_PHASE_K.md` §K3。

---

## 2. 信息架构(三个层面)

### 2.1 顶层导航(左侧 sidebar)

**四段结构(v4.1 校准)**:

```
[Heliox · AI 工作台]
[搜索 / 频道]

> 工作台
  · 主页 / 公司全景 / 项目列表 / 归档 / 引导 / roadmap

> 项目(本人参与)
  · #pixel-2(in build) / #invoice-flow(in review) / ...

> 插件 plugins
  · installed(已装)
  · sources(订阅源)

> 集成 integrations
  · MCP / connectors / anywhere

[设置]
```

宽度 ~240px。"插件"和"集成"是两段独立菜单,各自有子页(详见截图 15-19)。

### 2.2 主区(中央)

每个一级导航对应一个 view:

| 导航项 | 主区视图 |
|---|---|
| 主页 | **首页**:大问候句 + composer 主输入 + 顶部 4 KPI + "常用工作"模板网格 |
| 公司全景 | **6 张部门大卡**(部门 = 一组项目频道按业务归类) |
| 项目列表 | 项目卡瀑布流(可选,默认主页足够) |
| 归档 | 已完成 / 已归档项目列表 |
| #某项目 | **项目频道主视图**:顶部项目卡 + 中央时间线 + 右辅 dock |

### 2.3 项目频道右辅 dock(8 个 tab,v4.1 扩展)

| Tab | 内容 | 截图 |
|---|---|---|
| **preview** | 实时预览当前 active sandbox 的产物(iframe + 设备切换 + 刷新) | `03-project-pixel2-preview.png` |
| **tasks** | 今日待办 / 进行中 / 队列 三段;每条:title / 自动度 ring / assignee / status chip | `04-project-pixel2-tasks.png` |
| **graph** | mini DAG:节点(task/agent/delivery/tool/review),边带 verb 标签 | `05-project-pixel2-graph.png` |
| **deliveries** | 卡片列表:PR / 文档 / 图像 / token 等成品,带验证徽章 + accept/reject | `06-project-pixel2-deliveries.png` |
| **memory** | L2 / L3 记忆条目时间线;每条:发言点 + 一句话摘要 | `07-project-pixel2-memory.png` |
| **activity** | 细粒度事件流:工具调用 / 文件改动 / 浏览器动作 / 审计 | `08-project-pixel2-activity.png` |
| **editor** | sandbox 内文件编辑器(monaco / 类似):看代码 + 改 + 提交评审 | `09-project-pixel2-editor.png` |
| **inspect** | DOM / network / console 巡检面板(对 preview iframe 的开发者工具) | `10-project-pixel2-inspect.png` |

dock 宽度桌面 ~360px,移动端全屏抽屉。

**8 tab 的关系**:preview / editor / inspect 是「成品三件套」(看 / 改 / 调试);tasks / graph / deliveries / memory / activity 是「过程五件套」(规划 / 关系 / 产出 / 记忆 / 事件流)。

---

## 3. 核心视图清单(v4.1 扩展为 14 个桌面 + 4 个移动)

**桌面**:
1. `01-home` 主页(composer + KPI + 模板 + 右辅栏)
2. `02-dashboard` 公司全景(6 张部门卡)
3. `03-project-pixel2-preview` 项目频道 + dock=preview
4. `04-project-pixel2-tasks` 项目频道 + dock=tasks
5. `05-project-pixel2-graph` 项目频道 + dock=graph
6. `06-project-pixel2-deliveries` 项目频道 + dock=deliveries
7. `07-project-pixel2-memory` 项目频道 + dock=memory
8. `08-project-pixel2-activity` 项目频道 + dock=activity
9. `09-project-pixel2-editor` 项目频道 + dock=editor
10. `10-project-pixel2-inspect` 项目频道 + dock=inspect
11. `12-agent-aria` Agent 资料页(无聊天)
12. `13-settings` 设置
13. `14-new-project-modal` 新建项目弹窗
14. `15-plugins-installed` / `16-plugins-sources` 插件页(installed / sources 两 tab)
15. `17-integrations-mcp` / `18-integrations-connectors` / `19-integrations-anywhere` 集成页(MCP / Connectors / Anywhere 三 tab)

**移动**:
- `m-01-home` / `m-02-dashboard` / `m-03-project` / `m-04-agent-profile`
- dock 在移动端 = 全屏抽屉,通过底部 tab bar 切换 8 个内容(优先级:preview > tasks > deliveries 在前几位,editor / inspect 在后)

---

## 4. 卡片体系(从截图骨架提炼)

每种卡片有**统一的骨架**:`头部 banner(状态 chip + 关键 ring/数字) → 主体(标题/描述/列表) → action 区(按钮 / link)`。

### 4.1 部门大卡(公司全景用)

骨架:
- 头部:部门名 + 子标签(产品 / 品牌 / DesignOps)+ status chip(RUNNING / STUCK / IDLE / WAITING)
- 主体:**大自动度 ring(右上角,72-96px)** + 7 日 sparkline + 关键数字("本周交付 22 / 自动度 78%")
- 底部:一句话状态("本周 PRD 推进顺利 / 卡在数据合规等审批")

### 4.2 项目卡(频道顶部)

骨架:
- 左:项目编号 + 标题 + ALPHA / BETA 标
- **5 阶段进度条**:discovery → build → review → ship → maintenance(当前阶段高亮 + 已完成阶段实色)
- 4 个百分比:`build:100% | review:64% | ship:1% | maintenance:0%`
- 右:目标一句话 + 当前 owner + 自动度 ring

### 4.3 Progress Card(时间线内嵌)

继承 v1 D2 aurora-bar 语义。骨架:
- 顶部状态条:phase 图标 + 阶段标签 + agent 头像
- 主体:title + 阶段步骤列表(running 时最后一行 activity-in 入场)
- 运行中底部:1px aurora 流动条

### 4.4 Delivery Card(时间线内嵌)

继承 v1 D3 surface-glow + 贡献者头像。骨架:
- 头部 banner:`PackageCheck 图标 + "交付" + 小 Avatar + agent 名 + build/browser 双徽章 + surface-glow`
- 主体:title + 改动文件 diff 摘要 + 预览(iframe / 图像)
- 底部:accept / reject 按钮(D11)

### 4.5 Optimizer 建议卡

紫色 accent banner,业务问句标题,数据点 checklist,一键 apply。

### 4.6 今日动态条目(首页右辅栏)

骨架:
- 左侧 status 圆点(running / done / blocked / suggestion 色码)
- 主体:`[agent] [verb] [target]` 简短一行 + 时间
- 例:`Optimizer 建议把 Marketing 文案审查交给 AI`

---

## 5. 字号 / 留白 / 圆角阶梯

| 用途 | 字号 | 备注 |
|---|---|---|
| 首页大问候句 | 28-36px / font-bold | "想让 AI 团队做点什么?" 类标题 |
| 部门卡标题 + 项目标题 | 18-20px / font-semibold | |
| KPI 大数字 | 36-48px / font-bold / tabular-nums | 自动度 / 在线 / 交付数 |
| 卡片正文 | 13-14px / font-medium | |
| 二级提示 | 11-12px / text-tertiary | 状态描述、时间戳 |
| sidebar 项 | 13px | |

间距:
- 卡片间距:24-32px(比 v3 现状更松)
- 卡片内边距:16-20px
- section 之间:40-48px

圆角:以源 HTML 为准,既有 radius token 冲突就改。

---

## 6. 色彩与动效(贴近截图,源 HTML 里的 token 直接搬)

**捷径**:`reference/v4-source/index.html` 顶部 `<style>` 里有完整 OKLCH token 表(light + dark + 状态色 + Optimizer 紫 + 玻璃层 + 线条层级 + 动效 keyframe)。

**做法**:
1. 把源 HTML 的 `:root` 和 `[data-theme="dark"]` token 块**整段抽**到 `web/src/theme.css`,变量名以源 HTML 为准
2. 把动效 keyframe(aurora / pulse / glow 等)整段抽到 `web/src/index.css`
3. 既有 v1~v3 已挂载的旧 token 跟源 HTML 冲突 → **直接删旧的**,以源 HTML 为新标准
4. 抽完后既有组件如果还引用了被删的旧 token,会编译报错;**那就改组件**,顺便让它对齐新设计

### 6.1 直接复用 token

| 用途 | token |
|---|---|
| canvas 背景 | `--canvas` / `--surface-1/2/3` |
| 主文字 | `--text-primary/secondary/tertiary` |
| 主 accent | `--accent`(暖橙) |
| 状态色 | `--success` / `--warning` / `--info` / `--destructive` |
| Agent 状态 | `--agent-idle/working/reviewing/blocked/done` |
| 玻璃质感(运行中卡片) | `--glass-surface` / `--glass-border` |
| Identity 12 色(头像) | `--identity-1..12` |
| 部门 lane(可选) | `--lane-1/2/3/track`(并行通道) |

### 6.2 动效语义复用

| 状态 | 动效 |
|---|---|
| Progress 运行中底部 | `aurora-bar`(D2) |
| Delivery 头部 | `surface-glow`(D3) |
| AI 状态点 | `agent-pulse-ring`(D5) |
| 卡片 hover | `card-lift`(D3) |
| 入场新条目 | `activity-in`(D9) |
| 进入 dock | `cockpit-in`(v1 留存) |

### 6.3 新增视觉(必要少量)

| 用途 | 实现 |
|---|---|
| **自动度 ring** | SVG circle stroke-dasharray,从 `--accent` 过渡到 `--warning` 再到 `--destructive`(autonomy 100% = 全暖橙,<60% = 暖橙转 warning) |
| **5 阶段进度条** | 5 段 pill,已完成 = `--success` 实色,当前 = `--accent` 实色 + pulse,未来 = `--surface-3` 描边空心 |
| **7 日 sparkline** | mini SVG path,描边 `--accent`,无填充 |

---

## 7. schema 变更清单(v4 形态校准)

### 7.1 Channel 表

- 删除 `isDM`(或保留字段但全部 false,代码中不再读这个字段)
- 删除 `kind`(或保留但只允许 'project',默认值锁死)
- `goal` `phase` `ownerId` `startedAt` `archivedAt` 等保留(v3 G1 已加)
- `phase` 用枚举值:`discovery | build | review | ship | maintenance`(在代码层校验,字段类型仍是 String 兼容旧数据)

### 7.2 User 表

无变更。AI 助手 12 个 + 5 个真人保留。

### 7.3 Memory / Edge / Task / Delivery / RunEvent / Optimizer

无变更。v2/v3 schema 全部保留,只是路由层不再走 DM 分支。

### 7.4 ChannelMember

无变更。AI 通过 ChannelMember 加入项目频道。

### 7.5 Function(可选)

§10 提到的 Function 抽象,本轮**不做**,留到 v5。

---

## 8. 路由 / 后端校准

| 改造点 | 改法 |
|---|---|
| **去除 DM channel 创建** | API `POST /api/channels` 拒绝 `isDM=true`;打开 AI 助手卡时不创建 DM,只跳 Agent profile 页 |
| **去除 AI sidebar 私聊段** | 前端 sidebar 二段(工作台 + 项目),不再有 "AI 助手" 单独段 |
| **AI 助手入口移到 Agent profile** | 公司全景 / 项目频道成员 / 设置等位置可点 AI 名字打开资料页 |
| **executeTask 简化** | 不再需要校验 `channel.isDM`,因为没 DM 了 |
| **create_task 简化** | 不再需要拒 DM,因为没 DM 了 |
| **buildProjectContext 简化** | 所有 channel 都是 project,L2 / L3 注入路径统一 |
| **Mention 解析** | 在频道 @ AI = 触发执行(原 A2A 逻辑可复用,不能用就重写);DM 场景不存在了 |

### 8.1 既有 v1~v3 能力清单(参考用,不是必须保留)

如果以下能力**与新截图设计兼容**就继续用,**冲突就删了重写**。不要为了保留而保留。

- D1~D11 视觉 token(aurora / glow / 玻璃层 / 入场动画等)— 多数已被源 HTML 新 token 覆盖
- Algorithm Graph 视图 / Edge 表 + 10 verb / Optimizer Agent / autonomy 计算 / whyJson 字段
- 项目频道 schema / 三级记忆 schema / buildProjectContext 统一入口
- BUILD_INTENT_RE 词表 / 项目频道自动派任务 / Tasks tab 数据接通
- executeTask channelId 一致性 / 无 executor 硬 cede / create_task 后自动开工

**判断标准**:截图里需要 = 留;截图里没需要 = 不一定留;跟截图冲突 = 删。

---

## 9. 双模(深色为主,浅色可切)

- 双模 token 表以源 HTML 为准,直接抽
- 截图大多深色,但浅色版本必须可用(源 HTML 里有完整 light 那套)

---

## 10. 移动端

| 桌面布局 | 移动布局 |
|---|---|
| Sidebar + 主区 + dock 三栏 | 主区单栏 + 顶部 channel 切换抽屉 + 底部 dock tab bar |
| dock 5 tab 在右侧 | dock 5 tab 在底部全屏抽屉 |
| 项目卡 5 段进度条横排 | 5 段进度条横排但卡片堆叠 |
| 部门卡 3 列网格 | 部门卡单列堆叠 |

底线:**移动端不挡聊天输入**,composer 始终在底部 fixed。

---

## 11. 实施优先级(给下一个 Claude 用的顺序)

**P0(必做,UI 重塑 + 闭环重整)**:
1. 后端校准(去 DM 路径 + isDM=false 锁定 + phase enum 校验)
2. sidebar 重构(二段:工作台 + 项目)
3. 主页重写(问候 + composer + KPI + 模板 + 右辅栏)
4. 公司全景页(6 张部门卡)
5. 项目频道顶部项目卡(5 阶段进度 + 4 百分比)
6. dock 5 tab 真实接入(tasks / graph / deliveries / memory / activity)
7. Agent profile 页(只读,无聊天)
8. 新建项目 modal(多步表单)
9. 截图里出现的功能全部跑通;截图没出现的旧功能,**没用就删**

**P1(可选)**:
- 自动度 ring 抽组件
- 7 日 sparkline 抽组件
- 5 段进度条抽组件

**P2(下一轮)**:
- Function 抽象层
- AI 招聘 / 调岗 / 解聘
- Yesterday Recap

---

## 12. 底线(只有三条)

- **截图是新标准**。色值 / 字号 / 留白 / 卡片 / 动效 / 图标 / 文案口吻 / 命名,**全部以截图和源 HTML 为准**。既有 token / 命名 / 代码冲突就删
- **借鉴自 Open Design 仓库(Apache 2.0)的部分需在 `/THIRD_PARTY_LICENSES.md` 标注**;文件级大段借鉴时在文件顶部加 `// Inspired by open-design (Apache 2.0)` 注释
- 真实模型 / 工具 / sandbox / DB,不造假

唯一一条工程卫生:代码 / 注释里不出现 "Open Design" / "od-" 等生成工具名(避免误判外部依赖)。
