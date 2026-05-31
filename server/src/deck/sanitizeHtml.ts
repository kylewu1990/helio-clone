// Phase U / M2 步骤1:deck HTML 清洗 + 校验 + 标题/section 提取 —— 单一事实源。
// 从 runDeckJob(legacy)与 deckWorkflow.composeStep(mastra-inline)的内联逻辑按字节抽出,
// 零行为变更。M2 让 pi runner 读回的文件内容也走同一函数,避免"pi 把 HTML 包在围栏/夹带
// 前后文字时 M1 能救回、M2 误判失败"。叶子模块(无依赖,不 import index.ts)。
//
// 注意:LLM 配置缺失检查('未配置密钥' / 'not configured')是另一关注点,保留在各 call site
// (它引用 assistant.name,且属于"LLM 没跑成"而非"HTML 不合法")。

export type SanitizedDeck = { html: string; titleOut: string; sectionCount: number }

// 容错 ```html 围栏 / 前后空白 / 前置说明;校验合法性;提取标题与 section 数。
// 非法(无 <!doctype>…</html> / <1000 字符)时 throw —— 错误文案与 legacy 逐字一致。
export function sanitizeDeckHtml(llmText: string, topic: string): SanitizedDeck {
  // R3:解析 HTML(容错 ```html 围栏 / 前后空白 / 前置说明)
  let html = llmText
  // 去 markdown 围栏
  const fenceMatch = html.match(/```(?:html|HTML)?\s*([\s\S]+?)```/)
  if (fenceMatch) html = fenceMatch[1]
  // 找 <!doctype 或 <html 开始
  const docStart = html.search(/<!doctype\s+html|<html[\s>]/i)
  if (docStart >= 0) html = html.slice(docStart)
  const docEnd = html.lastIndexOf('</html>')
  if (docEnd >= 0) html = html.slice(0, docEnd + '</html>'.length)
  html = html.trim()

  if (!/<!doctype\s+html|<html[\s>]/i.test(html) || !html.endsWith('</html>')) {
    throw new Error(`LLM 没返回合法 HTML(预期 <!doctype html> ... </html>)· sample: ${llmText.slice(0, 220)}`)
  }
  if (html.length < 1000) {
    throw new Error(`LLM 返回 HTML 太短(${html.length} 字符)· sample: ${html.slice(0, 220)}`)
  }

  // 标题从 <title> 或 <h1> 提取
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const titleOut =
    (
      (titleMatch?.[1] || h1Match?.[1] || topic)
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    ).slice(0, 60) || topic
  // section 数(给统计用)
  const sectionCount = (html.match(/<section\s[^>]*class=["'][^"']*\bslide\b/g) || []).length

  return { html, titleOut, sectionCount }
}
