'use client'
import { useEffect, useState } from 'react'
import { simulateDemoAuction, type DemoAuctionConfig, type DemoAuctionState, type DemoTrialBid } from '@/lib/marketplace'

export function DemoAuction({ slug, config }: { slug: string; config: DemoAuctionConfig }) {
  const [elapsed, setElapsed] = useState(-Math.max(1, config.trigger_seconds))
  const [state, setState] = useState<DemoAuctionState | null>(null)
  const [bids, setBids] = useState<DemoTrialBid[]>([])
  const [alias, setAlias] = useState<'A' | 'B'>('A')
  const [maximum, setMaximum] = useState(config.starting_bid)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [chat, setChat] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const end = state?.ends_after_seconds ?? config.duration_seconds
  const status = elapsed < 0 ? 'Upcoming simulation' : elapsed >= end ? 'Simulation ended' : 'Live simulation'
  useEffect(() => { const timer = setInterval(() => setElapsed(value => value + 1), 1000); return () => clearInterval(timer) }, [])
  async function evaluate(next: DemoTrialBid[], at: number) {
    setBusy(true); setError('')
    try { const result = await simulateDemoAuction(slug, next, at); setState(result); setBids(next); setElapsed(at); setMaximum(result.next_bid) }
    catch (e) { setError(e instanceof Error ? e.message : 'Simulation could not be updated.') }
    finally { setBusy(false) }
  }
  const remaining = Math.max(0, elapsed < 0 ? -elapsed : end-elapsed)
  return <section aria-label="Auction simulation" className="mt-8 rounded-3xl border bg-muted p-5">
    <h3 className="text-2xl font-bold">Auction demonstration — no real bids</h3>
    <p className="mt-3 text-sm">This is your private, temporary simulation. Participants A and B are synthetic roles, not customer accounts. No money, inventory, notifications or orders are created.</p>
    <p className="mt-4 font-bold" role="status">{status}</p>
    <p className="text-xl tabular-nums">{elapsed < 0 ? 'Starts in' : 'Time remaining'}: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</p>
    <p className="mt-3">Simulated current bid: {config.currency} {state?.current_bid || config.starting_bid}</p>
    <p>Next bid: {config.currency} {state?.next_bid || config.starting_bid} · Increment: {config.increment}</p>
    <p>Proxy bidding: {config.proxy_enabled ? 'enabled' : 'disabled'}. {config.anti_snipe_enabled ? `A trial bid in the final ${config.trigger_seconds} seconds adds ${config.extension_seconds} seconds, up to ${config.maximum_extensions} times.` : 'No anti-sniping extension configured.'}</p>
    <p>Extensions demonstrated: {state?.extensions || 0}</p>
    <p>Leading synthetic alias: {state?.leader || 'No trial bids'}</p>
    <div className="my-4 flex flex-wrap gap-3">
      <button disabled={busy} className="min-h-11 rounded-full border px-4" onClick={() => void evaluate([], -Math.max(1,config.trigger_seconds))}>Restart demonstration</button>
      <button disabled={busy || elapsed >= 0} className="min-h-11 rounded-full border px-4 disabled:opacity-50" onClick={() => void evaluate([],0)}>Start simulation now</button>
      <button disabled={busy || elapsed < 0 || elapsed >= end} className="min-h-11 rounded-full border px-4 disabled:opacity-50" onClick={() => void evaluate(bids,Math.max(elapsed,end-Math.max(1,config.trigger_seconds)))}>Jump to final seconds</button>
      <button disabled={busy || elapsed < 0} className="min-h-11 rounded-full border px-4 disabled:opacity-50" onClick={() => void evaluate(bids,Math.max(elapsed,end))}>Finish and show outcome</button>
    </div>
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void evaluate([...bids,{alias,maximum,at:elapsed}],elapsed) }}>
      <label>Synthetic participant<select className="mt-1 w-full rounded-xl border bg-background p-3" value={alias} onChange={e => setAlias(e.target.value as 'A'|'B')}><option value="A">Participant A — Demo bidder ••01</option><option value="B">Participant B — Demo bidder ••02</option></select></label>
      <label>Trial maximum<input className="mt-1 w-full rounded-xl border bg-background p-3" inputMode="decimal" required value={maximum} onChange={e => setMaximum(e.target.value)} /></label>
      <button disabled={busy || elapsed < 0 || elapsed >= end || bids.length >= 50} className="min-h-11 self-end rounded-full bg-primary p-3 font-bold text-primary-foreground disabled:opacity-50">Submit simulated bid</button>
    </form>
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    {state?.outcome && <p className="mt-4 font-bold">{state.outcome === 'simulated_winner' ? `Simulated winner: ${state.leader}` : 'Simulation ended without a sale'}. No payment is due.</p>}
    <ol aria-label="Simulated bid history" className="mt-5 space-y-2">{state?.history.map((bid,index) => <li key={index}>{bid.alias} · {config.currency} {bid.price} · simulation +{bid.at}s</li>)}</ol>
    {config.chat_enabled && <section className="mt-6"><h4 className="font-bold">Local chat demonstration</h4><p className="text-sm">Messages stay in this browser tab. This is not a shared live chat room.</p><ul aria-label="Local demo messages" className="my-3 max-h-40 overflow-y-auto">{chat.map((text,index) => <li key={index} className="break-words">You (demo): {text}</li>)}</ul><form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if(message.trim()) { setChat(old => [...old.slice(-19),message.trim()]); setMessage('') } }}><input aria-label="Local demonstration message" maxLength={500} value={message} onChange={e => setMessage(e.target.value)} className="min-w-0 flex-1 rounded-xl border bg-background p-3" /><button className="min-h-11 rounded-full border px-4">Add local message</button></form></section>}
  </section>
}
