import { Children, useEffect, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { Download, X } from 'lucide-react'

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitMentions(text: string, names: string[]): ReactNode[] {
  const uniq = [...new Set(names.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  if (!uniq.length) return [text]
  const re = new RegExp('@(' + uniq.map(escapeRegex).join('|') + ')', 'g')
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <span
        key={k++}
        className="rounded px-0.5 font-medium"
        style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}
      >
        @{m[1]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function withMentions(children: ReactNode, names: string[]): ReactNode {
  if (!names.length) return children
  return Children.map(children, (c) =>
    typeof c === 'string' ? splitMentions(c, names) : c,
  )
}

// 裸图片链接转 markdown 图片(AI 有时直接返回图片 URL)
function preprocess(body: string): string {
  return body.replace(
    /(?<![(\]])\bhttps?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?/gi,
    (m) => `![](${m})`,
  )
}

function filenameOf(src: string): string {
  const base = (src.split('/').pop() || 'image').split('?')[0]
  return base.includes('.') ? base : base + '.png'
}

// 下载图片:同源走 blob 强制下载;跨源 fetch 失败则回退到新标签打开
async function downloadImage(src: string) {
  try {
    const res = await fetch(src)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filenameOf(src)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    window.open(src, '_blank', 'noopener')
  }
}

// 全屏看图:大图 + 下载/关闭,Esc 或点空白关闭,右键可另存
function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            downloadImage(src)
          }}
          title="下载图片"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <Download size={18} />
        </button>
        <button
          onClick={onClose}
          title="关闭(Esc)"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X size={18} />
        </button>
      </div>
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-[var(--radius-md)] object-contain shadow-2xl"
      />
    </div>
  )
}

export function MarkdownBody({
  body,
  mentionNames = [],
}: {
  body: string
  mentionNames?: string[]
}) {
  const [zoom, setZoom] = useState<string | null>(null)

  return (
    <div className="text-sm leading-relaxed break-words text-[var(--text-primary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: ({ children }) => (
            <p className="my-0.5">{withMentions(children, mentionNames)}</p>
          ),
          li: ({ children }) => (
            <li className="my-0.5">{withMentions(children, mentionNames)}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline"
              style={{ color: 'var(--accent-text)' }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            const s = typeof src === 'string' ? src : ''
            return (
              <span className="group/img relative my-1 inline-block">
                <img
                  src={s}
                  alt={alt || ''}
                  loading="lazy"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (s) setZoom(s)
                  }}
                  onContextMenu={(e) => e.stopPropagation()}
                  title="点击放大,右键可另存为"
                  className="block max-h-80 max-w-full cursor-zoom-in rounded-[var(--radius-md)] border border-[var(--border)] transition-opacity hover:opacity-95"
                />
                {s && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadImage(s)
                    }}
                    title="下载图片"
                    className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-black/55 text-white opacity-0 transition-opacity group-hover/img:opacity-100 hover:bg-black/75"
                  >
                    <Download size={14} />
                  </button>
                )}
              </span>
            )
          },
          code: ({ className, children }) =>
            className ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded bg-[var(--paper-mid)] px-1 py-0.5 text-[0.85em]">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="my-1 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--paper-mid)] p-2.5 text-xs">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="my-1 list-disc pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1 list-decimal pl-5">{children}</ol>
          ),
          h1: ({ children }) => (
            <h1 className="my-1 text-base font-semibold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="my-1 text-sm font-semibold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="my-1 text-sm font-semibold">{children}</h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1 border-l-2 border-[var(--border-strong)] pl-2 text-[var(--text-secondary)]">
              {children}
            </blockquote>
          ),
        }}
      >
        {preprocess(body)}
      </ReactMarkdown>
      {zoom && <ImageLightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}
