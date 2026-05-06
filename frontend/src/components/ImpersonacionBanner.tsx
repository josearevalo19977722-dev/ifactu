import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

export function ImpersonacionBanner() {
  const { impersonando, usuario, salirImpersonacion } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!impersonando) return null;

  function handleSalir() {
    salirImpersonacion();
    qc.clear(); // Limpiar caché al salir de impersonación
    navigate('/admin/tenants');
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'linear-gradient(90deg, #d97706 0%, #b45309 100%)',
        color: '#fff',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 13,
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span>
        <span style={{ marginRight: 8 }}>👁</span>
        Estás viendo como{' '}
        <strong>{usuario?.nombre ?? usuario?.email ?? 'empresa'}</strong>
        {' '}—{' '}
        <span style={{ opacity: 0.85, fontSize: 12 }}>
          Sesión de impersonación activa
        </span>
      </span>
      <button
        type="button"
        onClick={handleSalir}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.5)',
          color: '#fff',
          borderRadius: 6,
          padding: '4px 14px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.35)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
      >
        Salir
      </button>
    </div>
  );
}
