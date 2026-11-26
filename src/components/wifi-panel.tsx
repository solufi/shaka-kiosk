'use client';

import { useEffect, useRef, useState } from 'react';
import { Wifi } from 'lucide-react';
import { Button } from './ui/button';
import { VirtualKeyboard } from './virtual-keyboard';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

type Network = {ssid:string; bssid:string; connected:boolean; signal:number; security:string};
type Status = {busy:boolean; enabled?:boolean; ethernet?:boolean; networks:Network[]; message:string};

export function WifiPanel() {
  const [open, setOpen] = useState(false);
  return <Card className="lg:col-span-2">
    <CardHeader><CardTitle className="flex items-center gap-2"><Wifi aria-hidden="true"/>Réseau Wi-Fi</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <Button variant="outline" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Fermer les réglages Wi-Fi':'Configurer le Wi-Fi'}</Button>
      {open && <WifiSettings/>}
    </CardContent>
  </Card>;
}

async function request(data: Record<string,string>, signal: AbortSignal): Promise<Status> {
  const response = await fetch('/api/admin/wifi', {method:'POST', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data), signal});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Service Wi-Fi indisponible.');
  return result;
}

function WifiSettings() {
  const [status, setStatus] = useState<Status>({busy:false, networks:[], message:''});
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Network>();
  const [password, setPassword] = useState('');
  const lifetime = useRef<AbortController | null>(null);

  async function perform(action: string, extra: Record<string,string> = {}) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    setWaiting(true);
    setError('');
    try {
      let result = await request({action,...extra},signal);
      while (!signal.aborted && result.busy) {
        await new Promise(resolve=>setTimeout(resolve,800));
        result = await request({action:'status'},signal);
      }
      if (!signal.aborted) setStatus(result);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : 'Impossible de joindre le service Wi-Fi.');
    } finally {
      if (!signal.aborted) setWaiting(false);
    }
  }

  useEffect(()=>{
    const controller = new AbortController();
    lifetime.current = controller;
    void perform('scan');
    return ()=>controller.abort();
  },[]);

  const active = status.networks.find(network=>network.connected);
  const networks = status.networks.filter((network,index,list)=>list.findIndex(other=>
    other.ssid===network.ssid && other.security===network.security)===index);
  return <div className="space-y-3">
    {status.enabled !== undefined && <p>Wi-Fi · {active?.ssid || (status.enabled?'Déconnecté':'Désactivé')}{status.ethernet && '　|　Ethernet connecté'}</p>}
    <p role="status" aria-live="polite">{waiting?'Recherche ou connexion en cours…':error || status.message}</p>
    {!selected && <>
      <Button variant="outline" disabled={waiting} onClick={()=>void perform(status.enabled===false?'enable':'scan')}>
        {status.enabled===false?'Activer le Wi-Fi':'Rechercher les réseaux'}
      </Button>
      {!waiting && status.enabled && !networks.length && <p>Aucun réseau détecté.</p>}
      <div className="grid gap-2 sm:grid-cols-2">{networks.map(network=>
        <button type="button" key={network.bssid} disabled={waiting || network.connected || network.security==='unsupported'}
          className="rounded-md border px-3 py-2 text-left disabled:opacity-60" onClick={()=>{setSelected(network);setPassword('');setError('');}}>
          <b className="break-all">{network.ssid}</b><br/><small>{network.connected?'Connecté':network.security==='unsupported'?'Sécurité non prise en charge':network.security==='open'?'Ouvert':'Protégé'} · Signal {network.signal} %</small>
        </button>)}</div>
    </>}
    {selected && <div className="space-y-3">
      <p>Se connecter à <strong>{selected.ssid}</strong></p>
      {selected.security!=='open' && <><label className="block">Mot de passe Wi-Fi
        <input type="password" value={password} autoComplete="off" spellCheck={false} onChange={event=>setPassword(event.target.value)}
          className="mt-1 block w-full rounded-md border bg-background p-3"/></label>
        <div className="max-w-2xl [&_button]:min-w-0 [&_button]:h-11"><VirtualKeyboard value={password} onChange={setPassword} passwordMode/></div>
      </>}
      <div className="flex gap-3">
        <Button variant="outline" onClick={()=>{setPassword('');setSelected(undefined);}}>Annuler</Button>
        <Button disabled={waiting || (selected.security!=='open' && !password)} onClick={()=>{
          void perform('connect',{bssid:selected.bssid,ssid:selected.ssid,security:selected.security,password});
          setPassword('');setSelected(undefined);
        }}>Se connecter</Button>
      </div>
    </div>}
  </div>;
}
