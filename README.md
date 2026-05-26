# Heliox

本地优先的 AI 公司指挥中心。

## 给 AI 接手的入口

**只读这一个文件**:`docs/ai/README.md`

它会指引你到:
- 当前阶段(v4.1)
- 任务单(`docs/ai/CURRENT_GOAL_PROMPT.md`)
- 设计宪法(`docs/ai/HELIOX_V4_DESIGN_DOCTRINE.md`)
- 参考截图与源码(`docs/ai/reference/`)
- 第三方依赖归属(`THIRD_PARTY_LICENSES.md`)

## 给人接手的快速命令

```bash
pnpm install                # 首次
pnpm -C server db:push      # DB schema
pnpm dev                    # 启动(server 5373 + web 5173)
```

本地测试 LLM 端点见 `docs/ai/CURRENT_GOAL_PROMPT.md` "本机测试"段。
