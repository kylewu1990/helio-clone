// Inspired by tiptap/tiptap demos/src/Examples (MIT), see /THIRD_PARTY_LICENSES.md
import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { cn } from '../../lib/cn'

export interface TiptapComposerProps {
  value: string
  onChange: (text: string) => void
  placeholder?: string
  className?: string
  minHeight?: number
}

// 轻量 tiptap composer:富文本编辑 + placeholder + onChange(plain text out)
// HomeView 用它替代裸 textarea,满足 H3 必装清单。
export function TiptapComposer({
  value,
  onChange,
  placeholder = '描述一个任务…',
  className,
  minHeight = 96,
}: TiptapComposerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap-composer prose prose-sm max-w-none focus:outline-none',
          'text-[14px] leading-relaxed text-[var(--ink)]',
          className,
        ),
        style: `min-height:${minHeight}px;`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getText())
    },
  })

  useEffect(() => {
    if (!editor) return
    const current = editor.getText()
    if (value !== current) editor.commands.setContent(value || '')
  }, [editor, value])

  return <EditorContent editor={editor} />
}
