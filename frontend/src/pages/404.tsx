import Link from 'next/link';

export default function Custom404() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center', padding: '32px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: 'rgba(19,70,161,0.1)', color: '#1346a1', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '20px', border: '1px solid rgba(19,70,161,0.2)' }}>
          404
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#18181B', margin: '0 0 8px 0' }}>
          Page Not Found
        </h1>
        <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5', margin: '0 0 24px 0' }}>
          The requested resource was not found or has been relocated within the BSC Textiles HRMS network.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link
            href="/dashboard"
            style={{ padding: '10px 20px', backgroundColor: '#1346a1', color: '#ffffff', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', textDecoration: 'none' }}
          >
            Go to Dashboard
          </Link>
          <Link
            href="/login"
            style={{ padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#334155', borderRadius: '8px', fontSize: '12px', fontWeight: '600', textDecoration: 'none' }}
          >
            Sign In
          </Link>
        </div>
        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', fontSize: '11px', color: '#94a3b8' }}>
          BSC Textiles Pvt Ltd &bull; Master Retail Operations Network
        </div>
      </div>
    </div>
  );
}
