# U_BUILD_RESULT — Phase U 各里程碑三构建结果

三构建(R4):`pnpm -C server build`(tsc)、`pnpm -C web tsc`、`pnpm -C web build`;
CrewAI 子服务:`ruff check`(+ pytest 若引入)。

## M0 — 三框架 spike(零业务侵入)

| 构建 | 结果 | 备注 |
|---|---|---|
| `pnpm -C server build` | ✅ green | 加 @mastra/core + pi-agent-core + pi-ai 依赖;src 未引用;spike 在 `server/orchestration/`(tsc include 之外),零影响 |
| `services/crew` `ruff check app.py` | ✅ All checks passed | |
| web 构建 | n/a | M0 未触碰前端 |

## M1 — Mastra 接管 deck 编排

| 构建 | 结果 | 备注 |
|---|---|---|
| `pnpm -C server build` | ✅ green | `server/src/orchestration/deckWorkflow.ts` 进 build(Mastra 类型在 skipLibCheck+strict:false+z.any() 下编译通过);index.ts DI 接线编译通过 |
| `pnpm -C web build`(= `tsc -b && vite build`) | ✅ green | web 的 `build` 脚本已含 `tsc -b` 类型检查;`vite build` ✓ 3.17s。另跑 `tsc --noEmit` 亦 clean。M1 未改前端 |

schema:`prisma db push` ✅(additive:`AppSetting.orchestrationEngine` + `GenerationJob.snapshotJson`,零数据丢失)。

> 真测见 `U_LOGIC_VALIDATION.md`。
