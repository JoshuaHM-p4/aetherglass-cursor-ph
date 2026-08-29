// components/pane/Pane.tsx
//
// The glass. Tailwind only, no CSS-in-JS. Phaser draws nothing here and this draws
// nothing in the canvas.

'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type JSX, type KeyboardEvent } from 'react';
import { paneParagraphs } from '../../lib/client/paneText';
import {
  useOracleTurn,
  type ChoiceRack as Rack,
  type PaneMessage,
  type PaneStatus,
} from '../../lib/client/useOracleTurn';
import { bus } from '../../game/EventBus';
import { setPaneTyping } from '../../game/inputCapture';
import { requestSessionDismiss } from '../../lib/client/paneSessions';
import { paneBoxBesidePlayer, readPlayerAnchor } from '../../game/playerAnchor';
import { useGame } from '../useGame';
import ChoiceRack from './ChoiceRack';

export default function Pane(): JSX.Element {
  const { messages, status, rack, ask, choose, activeEntityId } = useOracleTurn();
  const integrity = useGame((s) => s.state.player.paneIntegrity);
  const entityName = useGame((s) =>
    activeEntityId ? (s.state.entities[activeEntityId]?.name ?? null) : null,
  );
  const thinking = status === 'thinking';
  const lastId = messages.at(-1)?.id;
  const tail = messages.at(-1)?.text ?? '';
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLOListElement>(null);

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
      event.preventDefault();
      if (event.target instanceof HTMLElement) event.target.blur();
      requestSessionDismiss();
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [activeEntityId]);

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

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, tail, status, rack?.status]);

  if (!activeEntityId) return <></>;

  const pending = rack?.status === 'pending' ? rack : null;

  return (
    <div
      ref={boxRef}
      className="pointer-events-auto absolute top-0 left-0 flex max-h-[78vh] w-[min(260px,calc(100vw-1.5rem))] flex-col"
      style={{ visibility: 'hidden' }}
    >
      <Glass integrity={integrity} status={status} subject={entityName}>
        <ol
          ref={scrollerRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1"
        >
          {messages.map((m) => (
            <li key={m.id}>
              <PaneMessageView
                {...m}
                streaming={status === 'streaming' && m.role === 'pane' && m.id === lastId}
              />
            </li>
          ))}
        </ol>
        {pending && (
          <div className="shrink-0">
            <ChoiceRack rack={pending} onChoose={choose} />
          </div>
        )}
        <PaneInput disabled={thinking} placeholder="speak" onSubmit={ask} />
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
      className={`pane-glass pointer-events-auto relative flex min-h-0 max-h-[78vh] flex-col overflow-hidden px-4 py-3.5 ${
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
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <span className="font-pixel text-[9px] tracking-[0.28em] text-amber-200/70">
          AETHERGLASS
          {props.subject ? (
            <span className="ml-2 tracking-normal text-amber-100/55">· {props.subject}</span>
          ) : null}
        </span>
        <span className="font-pixel text-[8px] text-white/35">{props.integrity}%</span>
      </header>
      {props.children}
    </motion.aside>
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
      <p className="font-pixel text-[10px] leading-snug text-white/45">
        {props.text}
      </p>
    );
  }

  const stanzas = paneParagraphs(props.text);
  if (stanzas.length === 0) {
    return props.streaming ? (
      <p className="font-pixel text-[11px] leading-[1.65] text-amber-50/90">
        <span className="inline-block animate-pulse text-amber-300/80">▌</span>
      </p>
    ) : (
      <></>
    );
  }

  return (
    <div className="space-y-2.5">
      {props.streaming ? (
        <div className="space-y-2.5">
          {stanzas.map((stanza, i) => (
            <p key={i} className="font-pixel text-[11px] leading-[1.65] text-amber-50/90">
              {stanza}
              {i === stanzas.length - 1 && (
                <span className="ml-0.5 inline-block animate-pulse text-amber-300/80">▌</span>
              )}
            </p>
          ))}
        </div>
      ) : (
        stanzas.map((stanza, i) => <InkBleed key={i} text={stanza} />)
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

function InkBleed({ text }: { text: string }) {
  const reduced = useReducedMotion();
  const words = text.length === 0 ? [] : text.split(/(\s+)/);
  if (reduced) {
    return <p className="font-pixel text-[11px] leading-[1.65] text-amber-50/90">{text}</p>;
  }
  return (
    <p className="font-pixel text-[11px] leading-[1.65] text-amber-50/90">
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
        className="w-full bg-transparent font-pixel text-[11px] text-amber-50/90 outline-none placeholder:text-amber-100/30 disabled:opacity-40"
        placeholder={placeholder}
      />
    </form>
  );
}

export type { Rack as ChoiceRack };
