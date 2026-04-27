import { useState, useEffect } from 'react';
import { PaqueteExtraModal } from './PaqueteExtraModal';

interface LimiteDetail {
  usados: number;
  limite: number;
  extrasDisponibles: number;
}

/**
 * Escucha el evento global 'dte-limite-alcanzado' y muestra el modal
 * de compra de paquete extra. Se monta una sola vez en el nivel de App.
 */
export function DteLimiteProvider() {
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<LimiteDetail>({ usados: 0, limite: 0, extrasDisponibles: 0 });

  useEffect(() => {
    function onLimiteAlcanzado(e: Event) {
      const detail = (e as CustomEvent<LimiteDetail>).detail;
      setDetalle({
        usados: detail?.usados ?? 0,
        limite: detail?.limite ?? 0,
        extrasDisponibles: detail?.extrasDisponibles ?? 0,
      });
      setOpen(true);
    }

    window.addEventListener('dte-limite-alcanzado', onLimiteAlcanzado);
    return () => window.removeEventListener('dte-limite-alcanzado', onLimiteAlcanzado);
  }, []);

  return (
    <PaqueteExtraModal
      open={open}
      onClose={() => setOpen(false)}
      usados={detalle.usados}
      limite={detalle.limite}
    />
  );
}
