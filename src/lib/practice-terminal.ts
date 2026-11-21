import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Config = { key: string; reader: string; account: string };
type Phase = 'pending' | 'approved' | 'declined' | 'canceled';
type Attempt = { order: string; amount: number; phase: Phase; intent?: string; created: number };
type State = { machine: string; config: Config; attempt?: Attempt };

export class PracticeError extends Error {}
const fail = (message: string): never => { throw new PracticeError(message); };
const directory = () => join(homedir(), '.shaka-cache', 'terminal-essai');
const filename = () => join(directory(), 'configuration.json');
function machine() {
  if (!process.env.AGENT_TOKEN) return fail('Identité de la machine manquante.');
  return createHash('sha256').update(process.env.AGENT_TOKEN).digest('hex');
}
function read(): State | undefined {
  if (!existsSync(filename())) return;
  const state: State = JSON.parse(readFileSync(filename(), 'utf8'));
  if (state.machine === machine()) return state;
}
function save(state: State) {
  mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const temp = join(directory(), randomUUID());
  writeFileSync(temp, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  renameSync(temp, filename());
}
function validConfig(c: Config) {
  return /^(sk|rk)_test_[a-zA-Z0-9]+$/.test(c.key) && /^tmr_[a-zA-Z0-9]+$/.test(c.reader) &&
    (!c.account || /^acct_[a-zA-Z0-9]+$/.test(c.account));
}
async function stripe(c: Config, path: string, body?: Record<string,string>, key?: string) {
  if (!validConfig(c)) return fail('Utilisez une clé de test Stripe et un lecteur de cet environnement.');
  const headers: Record<string,string> = { Authorization: 'Bearer '+c.key, 'Stripe-Version':'2024-09-30.acacia' };
  if (c.account) headers['Stripe-Account'] = c.account;
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch('https://api.stripe.com/v1/'+path, {
    method: body ? 'POST' : 'GET', headers, body: body ? new URLSearchParams(body) : undefined,
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    if ([401,403,404].includes(response.status)) return fail('Stripe refuse l’accès. Vérifiez le lecteur, le compte et les permissions de la clé de test.');
    return fail('Stripe n’a pas confirmé la demande. Vérifiez le lecteur puis reprenez le suivi.');
  }
  const data = await response.json();
  if (data.livemode !== false) return fail('Le mode test Stripe doit être confirmé.');
  return data;
}
async function reader(c: Config) {
  const r = await stripe(c, 'terminal/readers/'+c.reader);
  if (r.id !== c.reader || !r.device_type || /simulated/i.test(r.device_type)) return fail('Un lecteur Stripe physique est requis.');
  return r;
}
function info(state?: State) {
  const a = state?.attempt;
  return { configured: !!state, reader: state?.config.reader, attempt: a && {order:a.order, amount:a.amount, phase:a.phase, reference:a.intent} };
}

async function advance(state: State, cancel: boolean) {
  const a = state.attempt!;
  const config = state.config;
  const prefix = 'shaka-essai-'+a.order;
  if (!a.intent) {
    // The durable reservation precedes the request. Never replay creation beyond Stripe’s idempotency window.
    if (Date.now()-a.created >= 23*3600000) {a.phase='canceled';save(state);return;}
    const intent = await stripe(config,'payment_intents',{
      amount:String(a.amount),currency:'cad','payment_method_types[]':'interac_present',capture_method:'automatic',
      'metadata[shaka_practice]':a.order
    },prefix+'-intent');
    if (!/^pi_[a-zA-Z0-9]+$/.test(intent.id)) return fail('Référence de paiement de test invalide.');
    a.intent=intent.id;
    save(state);
  }
  const intentId=a.intent;
  if (!intentId) return fail('Référence de paiement de test manquante.');
  const intentPath='payment_intents/'+intentId;
  const intent=await stripe(config,intentPath+'?expand%5B%5D=latest_charge');
  if (intent.id!==a.intent || intent.metadata?.shaka_practice!==a.order || intent.amount!==a.amount || intent.currency!=='cad')
    return fail('Les détails du paiement de test ne correspondent pas au panier.');
  if (intent.status==='succeeded') {
    if (intent.amount_received!==a.amount || intent.latest_charge?.payment_method_details?.type!=='interac_present')
      return fail('Stripe doit confirmer le montant et le réseau Interac.');
    a.phase='approved';
  } else if (intent.status==='canceled') {
    a.phase='canceled';
  } else if (intent.status==='processing') {
    return;
  } else {
    const r=await reader(config);
    const action=r.action;
    const ours=action?.process_payment_intent?.payment_intent===a.intent;
    if (cancel) {
      if (ours && action.status==='in_progress') await stripe(config,'terminal/readers/'+config.reader+'/cancel_action',{},prefix+'-stop');
      const result=await stripe(config,intentPath+'/cancel',{},prefix+'-cancel');
      if (result.status==='canceled') a.phase='canceled';
    } else if (intent.last_payment_error || (ours && action.status==='failed')) {
      a.phase='declined';
    } else if (!ours && intent.status==='requires_payment_method') {
      if (r.status!=='online' || action?.status==='in_progress') return fail('Le lecteur est hors ligne ou occupé. Reprenez le suivi ou annulez cet essai.');
      await stripe(config,'terminal/readers/'+config.reader+'/process_payment_intent',{payment_intent:intentId},prefix+'-reader');
    }
  }
  save(state);
}

async function perform(input: Record<string,unknown>) {
  let state=read();
  if (input.action==='info') return info(state);
  if (input.action==='configure') {
    if (state?.attempt?.phase==='pending') return fail('Terminez l’essai en cours avant de changer le lecteur.');
    const config={key:String(input.key||'').trim(),reader:String(input.reader||'').trim(),account:String(input.account||'').trim()};
    await reader(config);
    state={machine:machine(),config};
    save(state);
    return info(state);
  }
  if (!state) return fail('Associez un lecteur de test à cette machine.');
  if (!['start','poll','cancel'].includes(String(input.action)) || typeof input.order!=='string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input.order)) return fail('Demande de test invalide.');
  if (input.action==='start' && state.attempt?.order!==input.order) {
    if (state.attempt?.phase==='pending') return fail('Un autre essai est en cours sur ce lecteur.');
    if (typeof input.amount!=='number' || !Number.isSafeInteger(input.amount) || input.amount<50 || input.amount>99999999)
      return fail('Le montant de test doit être compris entre 0,50 $ et 999 999,99 $.');
    const r=await reader(state.config);
    if (r.status!=='online' || r.action?.status==='in_progress') return fail('Le lecteur doit être en ligne et disponible.');
    state.attempt={order:input.order,amount:input.amount,phase:'pending',created:Date.now()};
    save(state);
  }
  if (state.attempt?.order!==input.order) return fail('Aucun essai correspondant sur cette machine.');
  if (input.action==='start' && input.amount!==state.attempt.amount) return fail('Le montant du panier a changé.');
  if (state.attempt.phase==='pending') await advance(state,input.action==='cancel');
  return info(state);
}
// This endpoint runs in the single kiosk server. Serialize reader commands from repeated taps or multiple tabs.
let queue: Promise<unknown>=Promise.resolve();
export function practiceTerminal(input: Record<string,unknown>) {
  const result=queue.then(()=>perform(input));
  queue=result.catch(()=>{});
  return result;
}
