# AskX CrewAI 子服务

§1 铁律:CrewAI **永不当全局主控**。它只是 Mastra step 通过 HTTP 调用的子任务 —
Mastra 发结构化请求 `{role, brief, context}` → 这里用 `Crew` 跑 → 返回结构化 JSON。
CrewAI 不感知 AskX 的频道 / WS / DB。

## 角色(M3 落地)
- `researcher` / `analyst` → `MaterialResult{summary, points[]}`
- `critic` → `CriticScore{clarity, design, narrative, data_support, persuasion, needs_revision, notes}`(对齐 `composeCriticPrompt` 的 5 维 schema)

## 起服务
```bash
cd services/crew
uv venv --python 3.11
uv pip install -r requirements-lock.txt   # 或 uv pip install crewai litellm fastapi 'uvicorn[standard]' pydantic
CREW_LLM_KEY=sk-local-... CREW_PORT=8341 .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8341
```

## LLM(R5)
litellm 指向本地 OpenAI 兼容 Gemini 代理(只有 Gemini 真有上游 auth):
- `CREW_LLM_BASE`(默认 `http://127.0.0.1:8317/v1`)
- `CREW_LLM_KEY`(`sk-local-...`)
- `CREW_LLM_MODEL`(默认 `gemini-2.5-flash`)

模型串用 litellm 的 `openai/<model>` 前缀 + 自定义 `base_url`(CrewAI 1.x 需装 `litellm` fallback)。

## 接口
- `GET /health` → `{ok, model, base, has_key}`
- `POST /crew/run` `{role, brief, context?}` → `{ok, role, result}`

## 软降级(M3)
Mastra 的 `crewStep` 调本服务时带 timeout + 重试;不可达 → 软降级,编排卡标注"分析 AI 未参与",主流程不挂。
