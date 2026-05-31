"""
AskX CrewAI 子服务 — M0 spike。

铁律(§1):CrewAI 永不当全局主控。它只是 Mastra step 通过 HTTP 调用的子任务:
  Mastra 发结构化请求 {role, brief, context} → 这里用 Crew 跑 → 返回结构化 JSON。
CrewAI 不感知 AskX 的频道 / WS / DB。

LLM:litellm 指向本地 OpenAI 兼容 Gemini 代理(R5,只有 Gemini 真有上游 auth)。
M0 只验证:1 agent 1 task + output_pydantic 结构化返回 + critic 5 维评分 schema。
M3 再为 researcher / analyst / critic 各建专门 Crew。
"""
from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

# ---- LLM 配置(OpenAI 兼容,litellm openai/ 前缀 + 自定义 base_url)----
CREW_LLM_BASE = os.environ.get("CREW_LLM_BASE", "http://127.0.0.1:8317/v1")
CREW_LLM_KEY = os.environ.get("CREW_LLM_KEY", "")
CREW_LLM_MODEL = os.environ.get("CREW_LLM_MODEL", "gemini-2.5-flash")

# belt-and-suspenders:litellm OpenAI provider 也读这些 env
os.environ.setdefault("OPENAI_API_BASE", CREW_LLM_BASE)
os.environ.setdefault("OPENAI_API_KEY", CREW_LLM_KEY or "sk-noop")

app = FastAPI(title="AskX CrewAI 子服务", version="0.1.0")


# ---- 请求 / 响应 schema ----
class CrewRunRequest(BaseModel):
    role: str = Field(description="researcher | analyst | critic")
    brief: str = Field(description="任务简报(topic/audience/要分析的素材等)")
    context: Optional[dict[str, Any]] = None


class CriticScore(BaseModel):
    """critic 5 维评分(对齐 composeCriticPrompt schema)。"""
    clarity: int = Field(ge=0, le=10)
    design: int = Field(ge=0, le=10)
    narrative: int = Field(ge=0, le=10)
    data_support: int = Field(ge=0, le=10)
    persuasion: int = Field(ge=0, le=10)
    needs_revision: bool
    notes: str


class MaterialResult(BaseModel):
    """researcher / analyst 结构化素材。"""
    summary: str
    points: list[str]


def make_llm():
    # 延迟 import,避免 crewai 没装好时整个 app import 失败
    from crewai import LLM

    return LLM(
        model=f"openai/{CREW_LLM_MODEL}",
        base_url=CREW_LLM_BASE,
        api_key=CREW_LLM_KEY or "sk-noop",
        temperature=0.4,
    )


ROLE_BACKSTORY = {
    "researcher": ("资料调研专家", "你擅长围绕主题快速整理事实、数据点、对比信息,给出可被 deck 直接引用的要点。"),
    "analyst": ("数据分析师", "你擅长把素材提炼成结构化洞察:趋势、对比、关键数字,给 deck 提供数据支撑。"),
    "critic": ("演示评审专家", "你从清晰度/设计/叙事/数据支撑/说服力五个维度严格评审 deck,给 0-10 分并指出是否需要返工。"),
}


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": CREW_LLM_MODEL, "base": CREW_LLM_BASE, "has_key": bool(CREW_LLM_KEY)}


@app.post("/crew/run")
def crew_run(req: CrewRunRequest) -> dict[str, Any]:
    from crewai import Agent, Crew, Process, Task

    role = req.role if req.role in ROLE_BACKSTORY else "researcher"
    title, backstory = ROLE_BACKSTORY[role]
    llm = make_llm()

    is_critic = role == "critic"
    out_model = CriticScore if is_critic else MaterialResult

    agent = Agent(
        role=title,
        goal=f"针对简报产出{'5 维评审评分' if is_critic else '结构化调研/分析素材'}",
        backstory=backstory,
        llm=llm,
        verbose=False,
    )
    if is_critic:
        desc = (
            f"严格评审下面这份 deck 简报,按 clarity/design/narrative/data_support/persuasion 五维各打 0-10 分,"
            f"给 needs_revision 布尔与简短 notes。简报:\n{req.brief}"
        )
        expected = "一个 JSON:{clarity,design,narrative,data_support,persuasion,needs_revision,notes}"
    else:
        desc = f"针对下面简报产出 summary + 3-6 条可直接进 deck 的 points。简报:\n{req.brief}"
        expected = "一个 JSON:{summary, points:[...]}"

    task = Task(description=desc, expected_output=expected, agent=agent, output_pydantic=out_model)
    crew = Crew(agents=[agent], tasks=[task], process=Process.sequential, verbose=False)

    result = crew.kickoff()
    payload = result.pydantic.model_dump() if getattr(result, "pydantic", None) else {"raw": str(result)}
    return {"ok": True, "role": role, "result": payload}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("CREW_PORT", "8341")))
