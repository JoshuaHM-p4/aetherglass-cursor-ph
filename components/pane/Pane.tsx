// components/pane/Pane.tsx
//
// The glass. Tailwind only, no CSS-in-JS. Phaser draws nothing here and this draws
// nothing in the canvas.

'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type WheelEvent } from 'react';
import { paneParagraphs } from '../../lib/client/paneText';
import {
  useOracleTurn,
  type ChoiceRack as Rack,
  type PaneMessage,
  type PaneStatus,
} from '../../lib/client/useOracleTurn';
import { bus } from '../../game/EventBus';
import { playChatBlip, playFileSfx, playTypeClick } from '../../game/systems/fileSfx';
import { setPaneTyping } from '../../game/inputCapture';
import { requestSessionDismiss } from '../../lib/client/paneSessions';
import { paneBoxBesidePlayer, readPlayerAnchor } from '../../game/playerAnchor';
import { useGame } from '../useGame';
import ChoiceRack from './ChoiceRack';

type PanePage = { player: PaneMessage | null; pane: PaneMessage | null };

/** Message ids that already chattered, so page-flips and post-stream ink-bleed stay quiet. */
const voicedIds = new Set<string>();

function paginate(messages: readonly PaneMessage[]): PanePage[] {
  const pages: PanePage[] = [];
  let pending: PaneMessage | null = null;
  for (const message of messages) {
    if (message.role === 'player') {
      if (pending) pages.push({ player: pending, pane: null });
      pending = message;
      continue;
    }
    pages.push({ player: pending, pane: message });
    pending = null;
  }
  if (pending) pages.push({ player: pending, pane: null });
  return pages;
}

function onPageWheel(
  event: WheelEvent<HTMLDivElement>,
  scroller: HTMLDivElement | null,
  count: number,
  setPage: (fn: (page: number) => number) => void,
): void {
  if (count < 2) return;
  if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) return;
  if (Math.abs(event.deltaY) < 10) return;
  event.preventDefault();
  const dir = event.deltaY > 0 ? 1 : -1;
  setPage((page) => Math.max(0, Math.min(count - 1, page + dir)));
}

export default function Pane(): JSX.Element {
  const { messages, status, rack, ask, choose, activeEntityId, introBeat } = useOracleTurn();
  const integrity = useGame((s) => s.state.player.paneIntegrity);
  const entityName = useGame((s) =>
    activeEntityId ? (s.state.entities[activeEntityId]?.name ?? null) : null,
  );
  const thinking = status === 'thinking';
  const lastId = messages.at(-1)?.id;
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pages = useMemo(() => paginate(messages), [messages]);
  const [page, setPage] = useState(0);
  const current = pages[page] ?? pages.at(-1) ?? null;
  const onLatest = pages.length === 0 || page === pages.length - 1;

  useEffect(() => {
    bus.emit('pane:thinking', { thinking: status === 'thinking' || status === 'streaming' });
  }, [status]);

  useEffect(() => {
    if (!activeEntityId) {
      bus.emit('pane:awake', { open: false, reason: 'closed' });
      return;
    }
    bus.emit('pane:awake', { open: true, reason: 'interact' });
  }, [activeEntityId]);

  useEffect(() => {
    if (!activeEntityId) {
      setPaneTyping(false);
      return;
    }
    if (status === 'thinking' || status === 'streaming') setPaneTyping(true);
  }, [activeEntityId, status]);

  useEffect(() => {
    if (!activeEntityId) return;
    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (introBeat !== null) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      if (event.target instanceof HTMLElement) event.target.blur();
      requestSessionDismiss();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [activeEntityId, introBeat]);

  useEffect(() => {
    if (!activeEntityId) return;
    let raf = 0;
    let grabbed = false;
    const tick = () => {
      const el = boxRef.current;
      if (el) {
        const parent = el.offsetParent instanceof HTMLElement ? el.offsetParent : null;
        const box = paneBoxBesidePlayer(
          readPlayerAnchor(),
          { w: el.offsetWidth || 280, h: el.offsetHeight || 180 },
          { w: parent?.clientWidth ?? window.innerWidth, h: parent?.clientHeight ?? window.innerHeight },
        );
        el.style.left = `${box.left}px`;
        el.style.top = `${box.top}px`;
        el.style.visibility = 'visible';
        if (!grabbed) {
          grabbed = true;
          const input = el.querySelector('input');
          if (input instanceof HTMLInputElement && !input.disabled) {
            input.focus();
            setPaneTyping(true);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeEntityId]);

  useEffect(() => {
    setPage(Math.max(0, pages.length - 1));
  }, [pages.length, lastId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = 0;
  }, [page, lastId]);

  if (!activeEntityId) return <></>;

  const pending = rack?.status === 'pending' ? rack : null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-auto absolute top-0 left-0 flex max-h-[78vh] w-[min(260px,calc(100vw-1.5rem))] flex-col"
      style={{ visibility: 'hidden' }}
    >
      <Glass integrity={integrity} status={status} subject={entityName}>
        <div className="flex min-h-0 flex-1 gap-2 overflow-hidden">
          <div
            ref={scrollerRef}
            className="pane-scroll min-h-[3.5rem] flex-1 overflow-y-auto px-2 py-1.5"
            onWheel={(event) => onPageWheel(event, scrollerRef.current, pages.length, setPage)}
          >
            {current && (
              <div className="space-y-2.5">
                {current.player && <PaneMessageView {...current.player} />}
                {current.pane && (
                  <PaneMessageView
                    {...current.pane}
                    streaming={status === 'streaming' && current.pane.id === lastId}
                  />
                )}
                {thinking && onLatest && !current.pane && <ThinkingMark />}
              </div>
            )}
            {thinking && !current && <ThinkingMark />}
          </div>
          {pages.length > 1 && (
            <ol
              className="flex shrink-0 flex-col items-center justify-center gap-[5px] py-1"
              aria-label="conversation pages"
            >
              {pages.map((_, i) => {
                const active = i === page;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      aria-label={`reply ${i + 1} of ${pages.length}`}
                      aria-current={active}
                      onClick={() => {
                        setPage(i);
                        playFileSfx('cursor');
                      }}
                      className={`block h-[5px] w-[5px] rounded-full border ${
                        active
                          ? 'border-amber-200 bg-amber-300 shadow-[0_0_6px_rgba(201,168,106,0.7)]'
                          : 'border-amber-200/25 bg-amber-100/15 hover:bg-amber-200/40'
                      }`}
                    />
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {onLatest && pending && (
          <div className="shrink-0">
            <ChoiceRack rack={pending} onChoose={choose} />
          </div>
        )}
        {introBeat !== null ? (
          <p className="mt-3 shrink-0 border-t border-amber-400/20 px-2 pt-2 font-pixel text-[9px] tracking-widest text-amber-100/40">
            ENTER TO CONTINUE
          </p>
        ) : (
          <PaneInput disabled={thinking} placeholder="speak" onSubmit={ask} />
        )}
      </Glass>
    </div>
  );
}

export function Glass(props: {
  integrity: number;
  status: PaneStatus;
  subject?: string | null;
  children: React.ReactNode;
}): JSX.Element {
  const reduced = useReducedMotion();
  const crack = Math.max(0, Math.min(1, 1 - props.integrity / 100));
  const dormant = props.status === 'asleep';

  return (
    <motion.aside
      data-pane
      className={`pane-glass pointer-events-auto relative flex min-h-0 max-h-[78vh] flex-col overflow-hidden px-5 py-3.5 ${
        props.status === 'thinking' ? 'pane-thinking' : ''
      } ${dormant ? 'opacity-80' : 'opacity-100'}`}
      animate={
        reduced
          ? undefined
          : { y: [0, -7, 0], rotate: [-0.35, 0.45, -0.35] }
      }
      transition={
        reduced
          ? undefined
          : { duration: 6, repeat: Infinity, ease: 'easeInOut' }
      }
      style={{ boxShadow: '0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(201,168,106,0.18)' }}
    >
      <CrackOverlay opacity={crack} />
      <header className="mb-3 flex items-center justify-between gap-2">
        <span className="font-pixel text-[9px] tracking-[0.28em] text-amber-200/70">
          AETHERGLASS
          {props.subject ? (
            <span className="ml-2 tracking-normal text-amber-100/55">· {props.subject}</span>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5">
          {props.status === 'thinking' ? <ThinkingPips compact /> : null}
          <span className="font-pixel text-[8px] text-white/35">{props.integrity}%</span>
        </span>
      </header>
      {props.children}
    </motion.aside>
  );
}

function ThinkingPips({ compact = false }: { compact?: boolean }): JSX.Element {
  const reduced = useReducedMotion();
  return (
    <span className={`flex ${compact ? 'gap-[2px]' : 'gap-[3px]'}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`block ${compact ? 'h-[3px] w-[3px]' : 'h-[4px] w-[4px]'} bg-amber-200`}
          animate={reduced ? { opacity: 0.55 } : { opacity: [0.18, 1, 0.18] }}
          transition={
            reduced
              ? undefined
              : { duration: 0.84, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }
          }
        />
      ))}
    </span>
  );
}

function ThinkingMark(): JSX.Element {
  const reduced = useReducedMotion();
  return (
    <div
      className="flex items-center gap-2 px-0.5 py-1"
      role="status"
      aria-live="polite"
      aria-label="the glass is thinking"
    >
      <motion.span
        className="inline-flex"
        animate={
          reduced
            ? { opacity: [0.45, 1, 0.45] }
            : { rotate: [0, 0, 90, 90, 180, 180, 270, 270, 360], opacity: [0.65, 1, 0.65] }
        }
        transition={
          reduced
            ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 2.4, repeat: Infinity, ease: 'linear', times: [0, 0.18, 0.25, 0.43, 0.5, 0.68, 0.75, 0.93, 1] }
        }
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden
          style={{ imageRendering: 'pixelated', shapeRendering: 'crispEdges' }}
        >
          <path fill="#6aa8c4" d="M6 1h2v1h1v1h1v1h1v2h1v2H11v2h-1v1H9v1H7v1H5v-1H4v-1H3v-1H2V8H1V6h1V4h1V3h1V2h1V1h1z" />
          <path fill="#d7f4ff" d="M6 3h2v1h1v2H8v3H6V7H5V4h1z" />
          <path fill="#9ad4e8" d="M7 2h1v1h1v1h1v2H9v1H7V5H6V3h1z" />
        </svg>
      </motion.span>
      <ThinkingPips />
    </div>
  );
}

function CrackOverlay({ opacity }: { opacity: number }) {
  if (opacity <= 0.02) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 380 520"
      preserveAspectRatio="none"
      aria-hidden
      style={{ opacity }}
    >
      <path d="M40 0 L72 90 L58 140 L110 220 L90 310 L140 400" fill="none" stroke="#e8d7a8" strokeWidth="0.6" opacity="0.55" />
      <path d="M72 90 L130 70 L190 120" fill="none" stroke="#e8d7a8" strokeWidth="0.4" opacity="0.4" />
      <path d="M320 20 L280 110 L300 180 L250 260" fill="none" stroke="#e8d7a8" strokeWidth="0.5" opacity="0.35" />
      <path d="M58 140 L20 190" fill="none" stroke="#e8d7a8" strokeWidth="0.35" opacity="0.3" />
    </svg>
  );
}

export function PaneMessageView(
  props: PaneMessage & { streaming?: boolean },
): JSX.Element {
  if (props.role === 'player') {
    return (
      <p className="px-0.5 font-pixel text-[10px] leading-snug text-white/45">
        {props.text}
      </p>
    );
  }

  const stanzas = paneParagraphs(props.text);
  if (stanzas.length === 0) {
    return props.streaming ? (
      <p className="px-0.5 text-justify font-pixel text-[11px] leading-[1.65] text-amber-50/90">
        <span className="inline-block animate-pulse text-amber-300/80">▌</span>
      </p>
    ) : (
      <></>
    );
  }

  const streaming = Boolean(props.streaming);

  return (
    <div className="space-y-2.5 px-0.5">
      <ChatVoice id={props.id} text={props.text} streaming={streaming} />
      {streaming ? (
        <div className="space-y-2.5">
          {stanzas.map((stanza, i) => (
            <p key={i} className="text-justify font-pixel text-[11px] leading-[1.65] text-amber-50/90">
              {stanza}
              {i === stanzas.length - 1 && (
                <span className="ml-0.5 inline-block animate-pulse text-amber-300/80">▌</span>
              )}
            </p>
          ))}
        </div>
      ) : (
        stanzas.map((stanza, i) => (
          <InkBleed key={i} id={`${props.id}-${i}`} text={stanza} voice={!voicedIds.has(props.id)} />
        ))
      )}
      {props.refusals.length > 0 && (
        <ul className="space-y-0.5">
          {props.refusals.map((r, i) => (
            <li
              key={`${r.action}-${r.reason}-${i}`}
              className="font-pixel text-[9px] text-red-300/70 line-through decoration-red-400/80"
            >
              {r.action} — refused: {r.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatVoice({
  id,
  text,
  streaming,
}: {
  id: string;
  text: string;
  streaming: boolean;
}): null {
  const prev = useRef('');
  useEffect(() => {
    if (!streaming) {
      prev.current = text;
      return;
    }
    voicedIds.add(id);
    const added = text.slice(prev.current.length);
    prev.current = text;
    if (added.replace(/\s+/g, '').length === 0) return;
    playChatBlip();
  }, [id, text, streaming]);
  return null;
}

function InkBleed({ id, text, voice }: { id: string; text: string; voice: boolean }) {
  const reduced = useReducedMotion();
  const words = text.length === 0 ? [] : text.split(/(\s+)/);

  useEffect(() => {
    if (!voice) return;
    if (voicedIds.has(id)) return;
    voicedIds.add(id);
    if (reduced) {
      playChatBlip();
      return;
    }
    const timers: number[] = [];
    const tokens = text.split(/(\s+)/);
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i]!.trim() === '') continue;
      const delay = Math.min(i * 24, 1100);
      timers.push(window.setTimeout(() => playChatBlip(), delay));
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [id, text, voice, reduced]);

  if (reduced) {
    return <p className="text-justify font-pixel text-[11px] leading-[1.65] text-amber-50/90">{text}</p>;
  }
  return (
    <p className="text-justify font-pixel text-[11px] leading-[1.65] text-amber-50/90">
      {words.map((word, i) =>
        word.trim() === '' ? (
          <span key={i}>{word}</span>
        ) : (
          <motion.span
            key={`${word}-${i}`}
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.28, delay: Math.min(i * 0.024, 1.1), ease: 'easeOut' }}
          >
            {word}
          </motion.span>
        ),
      )}
    </p>
  );
}

function PaneInput({
  disabled,
  placeholder,
  onSubmit,
}: {
  disabled: boolean;
  placeholder: string;
  onSubmit: (text: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) {
      ref.current?.focus();
      setPaneTyping(true);
    }
  }, [disabled]);

  const keepKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') return;
    event.stopPropagation();
    if (event.type !== 'keydown') return;
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter' || event.key === 'Tab') return;
    if (event.key.length === 1 || event.key === 'Backspace') playTypeClick();
  };

  return (
    <form
      className="mt-3 shrink-0 border-t border-amber-400/20 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        const text = String(new FormData(event.currentTarget).get('ask') ?? '').trim();
        if (text === '') return;
        onSubmit(text);
        event.currentTarget.reset();
        ref.current?.focus();
      }}
    >
      <input
        ref={ref}
        name="ask"
        type="text"
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setPaneTyping(true)}
        onBlur={() => setPaneTyping(false)}
        onKeyDown={keepKeys}
        onKeyUp={keepKeys}
        className="w-full bg-transparent px-2 font-pixel text-[11px] text-amber-50/90 outline-none placeholder:text-amber-100/30 disabled:opacity-40"
        placeholder={placeholder}
      />
    </form>
  );
}

export type { Rack as ChoiceRack };
