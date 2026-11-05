import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'multiple'>;

export function selectMenuPosition(rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>, desiredHeight: number, viewportWidth: number, viewportHeight: number) {
  const margin = 8, gap = 6;
  const below = Math.max(0, viewportHeight - rect.bottom - gap - margin);
  const above = Math.max(0, rect.top - gap - margin);
  const useAbove = desiredHeight > below && above > below;
  const maxHeight = useAbove ? above : below;
  const height = Math.min(desiredHeight, maxHeight);
  const width = Math.max(0, Math.min(rect.width, viewportWidth - 2 * margin));
  return { left: Math.max(margin, Math.min(rect.left, viewportWidth - width - margin)), top: Math.max(margin, useAbove ? rect.top - gap - height : rect.bottom + gap), width, maxHeight };
}

/** A single-select field with a viewport-bounded menu, including inside dialogs. */
export function PopoverSelect({ children, value, defaultValue, onChange, disabled, className, id, title, ...props }: Props) {
  const [internal, setInternal] = useState(String(defaultValue ?? ''));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 0, maxHeight: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = String(value ?? internal);
  const options = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>[];
  const selectedOption = options.find(option => String(option.props.value ?? option.props.children) === selected);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const place = () => {
      if (!trigger.current || !menu.current) return;
      const rect = trigger.current.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) { setOpen(false); return; }
      menu.current.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
      setPosition(selectMenuPosition(rect, menu.current.scrollHeight, window.innerWidth, window.innerHeight));
    };
    place();
    (menu.current.querySelector<HTMLButtonElement>('[aria-selected="true"]:not(:disabled)') || menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, children]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const choose = (next: string) => {
    const target = { value: next };
    onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>);
    if (value === undefined) setInternal(target.value);
    close();
  };
  const navigate = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } else setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    items[next].scrollIntoView({ block: 'nearest' });
  };
  return <>
    <button ref={trigger} id={id} type="button" title={title} disabled={disabled} className={`${className || ''} flex items-center justify-between gap-2 text-left`} aria-label={props['aria-label']} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <span className="min-w-0 truncate">{selectedOption?.props.children ?? selected}</span><ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
    </button>
    {open && createPortal(<div ref={menu} id={menuId} role="listbox" aria-label={props['aria-label'] || title || 'Options'} onKeyDown={navigate} style={{ position: 'fixed', ...position, overflowY: 'auto' }} className="z-[1200] rounded-xl border border-white/10 bg-[#191b20] p-1 text-[11px] font-mono text-slate-300 shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      {options.map((option, index) => { const optionValue = String(option.props.value ?? option.props.children); return <button key={option.key ?? index} type="button" role="option" aria-selected={selected === optionValue} disabled={option.props.disabled} onClick={() => choose(optionValue)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/5 focus:bg-white/5 focus:outline-none disabled:opacity-40"><span className="w-3 shrink-0">{selected === optionValue && <Check aria-hidden="true" className="h-3 w-3 text-cyan-400" />}</span><span className="min-w-0 break-words">{option.props.children}</span></button>; })}
    </div>, trigger.current?.closest('dialog') || document.body)}
  </>;
}
