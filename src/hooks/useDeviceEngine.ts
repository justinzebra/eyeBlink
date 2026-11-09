import { useEffect } from 'react';
import { mockDevice } from '../services/mockDeviceService';
export function useDeviceEngine() {
  useEffect(() => { const timer = window.setInterval(() => mockDevice.emit(),50); return () => clearInterval(timer); },[]);
}
