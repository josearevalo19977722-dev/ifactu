/**
 * ToastContext — wrapper sobre Sileo.
 * Mantiene la misma API (useToast, ToastProvider) para no cambiar los call sites.
 * El <Toaster> de Sileo se monta en App.tsx.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { sileo } from 'sileo';

interface ToastCtx {
  success: (message: string, detail?: string) => void;
  error:   (message: string, detail?: string) => void;
  info:    (message: string, detail?: string) => void;
  warning: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

/** Funciones globales mapeadas a Sileo */
const toastImpl: ToastCtx = {
  success: (message, detail) => sileo.success({ title: message, description: detail }),
  error:   (message, detail) => sileo.error({   title: message, description: detail }),
  info:    (message, detail) => sileo.info({    title: message, description: detail }),
  warning: (message, detail) => sileo.warning({ title: message, description: detail }),
};

/** Provider sin estado propio — solo propaga las funciones de Sileo */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastContext.Provider value={toastImpl}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
