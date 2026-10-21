import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Option = { readonly value: string; readonly label: string }

/** A keyboard-accessible listbox positioned against its trigger and viewport. */
export function StudiosSelect({ label, value, options, onChange }: {
  readonly label: string
  readonly value: string
  readonly options: readonly Option[]
  readonly onChange: (value: string) => void
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.findIndex(option => option.value === value)))
  const [placement, setPlacement] = useState<React.CSSProperties>({})
  const selected = options.find(option => option.value === value) ?? options[0]

  useLayoutEffect(() => {
    if (!open || trigger.current === null) return
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect()
      if (rect === undefined) return
      const gap = 6
      const maxHeight = Math.max(120, Math.min(320, window.innerHeight - 24))
      const openBelow = window.innerHeight - rect.bottom >= Math.min(maxHeight, options.length * 40 + 12) + gap || rect.top < window.innerHeight / 2
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 24)
      setPlacement({
        position: 'fixed',
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
        maxHeight,
        ...(openBelow ? { top: Math.min(window.innerHeight - maxHeight - 12, rect.bottom + gap) } : { bottom: Math.max(12, window.innerHeight - rect.top + gap) }),
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node) || list.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const choose = (index: number) => {
    const option = options[index]
    if (option === undefined) return
    onChange(option.value)
    setActiveIndex(index)
    setOpen(false)
    trigger.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      setActiveIndex(current => (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Home' && open) { event.preventDefault(); setActiveIndex(0) }
    else if (event.key === 'End' && open) { event.preventDefault(); setActiveIndex(options.length - 1) }
    else if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); choose(activeIndex) }
    else if ((event.key === 'Escape' || event.key === 'Tab') && open) { setOpen(false) }
  }

  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open])

  return <>
    <div className="studiosSelect" ref={root}>
    <button ref={trigger} type="button" className="studiosSelectTrigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined} onClick={() => { setActiveIndex(Math.max(0, options.findIndex(option => option.value === value))); setOpen(current => !current) }} onKeyDown={onKeyDown}>
      <span>{selected?.label ?? '请选择'}</span><span className="studiosSelectChevron" aria-hidden="true">⌄</span>
    </button>
    </div>
    {open && createPortal(<div ref={list} id={id} role="listbox" aria-label={label} className="studiosSelectList" style={placement}>
      {options.map((option, index) => <div id={`${id}-option-${index}`} key={option.value} role="option" aria-selected={option.value === value} data-index={index} className={`studiosSelectOption ${index === activeIndex ? 'studiosSelectOptionActive' : ''}`} onPointerMove={() => { setActiveIndex(index) }} onClick={() => { choose(index) }}>
        <span>{option.label}</span>{option.value === value && <span aria-hidden="true">✓</span>}
      </div>)}
    </div>, document.body)}
  </>
}
