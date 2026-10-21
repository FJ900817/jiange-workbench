// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudiosSelect } from '../src/client/skeleton/StudiosSelect.tsx'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('StudiosSelect', () => {
  it('anchors near the trigger, flips above when space below is short, and supports keyboard selection', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    const onChange = vi.fn()
    render(<StudiosSelect label="画面比例" value="9:16" options={[{ value: '9:16', label: '9:16 竖屏' }, { value: '16:9', label: '16:9 横屏' }]} onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: /9:16 竖屏/ })
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ x: 1010, y: 790, top: 790, left: 1010, right: 1210, bottom: 834, width: 200, height: 44, toJSON: () => ({}) } as DOMRect)

    fireEvent.click(trigger)
    const list = screen.getByRole('listbox', { name: '画面比例' })
    expect(list.getAttribute('style')).toContain('position: fixed')
    expect(list.getAttribute('style')).toContain('bottom: 116px')
    expect(list.getAttribute('style')).toContain('left: 1010px')

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('16:9')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on outside pointer and Escape without changing the selected value', () => {
    const onChange = vi.fn()
    render(<><StudiosSelect label="清晰度" value="1080p" options={[{ value: '1080p', label: '1080p' }, { value: '720p', label: '720p' }]} onChange={onChange} /><div data-testid="outside" /></>)
    const trigger = screen.getByRole('button', { name: /1080p/ })
    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
