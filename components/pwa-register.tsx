'use client';
import {useEffect} from 'react';
export function PwaRegister(){useEffect(()=>{const capture=(event:Event)=>{event.preventDefault();(window as Window&{__siroInstallPrompt?:Event}).__siroInstallPrompt=event};window.addEventListener('beforeinstallprompt',capture);if(!('serviceWorker' in navigator)||!window.isSecureContext)return()=>window.removeEventListener('beforeinstallprompt',capture);void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});return()=>window.removeEventListener('beforeinstallprompt',capture)},[]);return null}
