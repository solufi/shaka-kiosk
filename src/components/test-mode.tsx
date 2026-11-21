'use client';
import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { Button } from './ui/button';
const key='shaka:test-mode';
const Context=createContext({active:false,error:'',enable:async()=>{},disable:()=>{}});
export const useTestMode=()=>useContext(Context);
export function TestModeProvider({children}:{children:ReactNode}) {
  const [active,setActive]=useState(false),[error,setError]=useState('');
  const disable=()=>{setActive(false);try{sessionStorage.removeItem(key);}catch{}};
  const enable=async()=>{
    try {
      const response=await fetch('/api/admin/session',{cache:'no-store'}),data=await response.json();
      if (!response.ok || !data.authenticated) {window.dispatchEvent(new Event('shaka-admin-login-required'));throw Error('Reconnectez-vous au menu Admin pour activer le mode test.');}
      sessionStorage.setItem(key,'1');setError('');setActive(true);
    } catch(error){setError((error as Error).message);}
  };
  useEffect(()=>{
    try{if (sessionStorage.getItem(key)==='1') void enable();}catch{};
    const changed=()=>{try{if(localStorage.getItem('shaka:isAdmin')!=='1')disable();}catch{disable();}};
    window.addEventListener('shaka-admin-changed',changed);return()=>window.removeEventListener('shaka-admin-changed',changed);
  },[]);
  return <Context.Provider value={{active,error,enable,disable}}>{children}{active&&<div className="fixed left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-amber-400 bg-amber-100 px-5 py-2 text-sm whitespace-nowrap font-semibold text-amber-950 shadow-lg"><span>Essai du catalogue · Aucune distribution réelle</span><Button size="sm" variant="outline" onClick={disable}>Quitter l’essai du catalogue</Button></div>}{error&&<div role="alert" className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-xl bg-red-950 p-4 text-white" onClick={()=>setError('')}>{error}</div>}</Context.Provider>;
}
export function TestModeButton(){const mode=useTestMode();return <Button variant="outline" onClick={()=>mode.active?mode.disable():void mode.enable()}>{mode.active?'Quitter l’essai du catalogue':'Tester le panier du catalogue'}</Button>;}
