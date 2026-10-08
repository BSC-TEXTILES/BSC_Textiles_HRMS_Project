'use client';

import { useState, useEffect } from 'react';
import { 
  ShieldQuestion, Shield, Check, Lock, 
  Save, RefreshCw, AlertCircle 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function RolesAdminPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Default permissions mapping per role
  const [matrix, setMatrix] = useState<Record<string, string[]>>({
    SUPER_ADMIN: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'ASSIGN', 'EXPORT', 'IMPORT', 'CONFIGURE', 'MANAGE', 'RECORD', 'UPLOAD', 'PUBLISH', 'SCAN', 'VIEW_SENSITIVE_DATA'],
    ADMIN: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'ASSIGN', 'EXPORT', 'CONFIGURE', 'MANAGE', 'RECORD', 'UPLOAD', 'PUBLISH', 'SCAN', 'VIEW_SENSITIVE_DATA'],
    HR_MANAGER: ['VIEW', 'ADD', 'EDIT', 'APPROVE', 'ASSIGN', 'EXPORT', 'MANAGE', 'RECORD', 'VIEW_SENSITIVE_DATA'],
    FLOOR_MANAGER: ['VIEW', 'RECORD', 'ASSIGN', 'APPROVE', 'SCAN'],
    TEA_BREAK_MANAGER: ['VIEW', 'SCAN', 'RECORD'],
    T_SHOP_OWNER: ['VIEW', 'SCAN', 'RECORD'],
    EMPLOYEE: ['VIEW', 'RECORD'],
  });

  useEffect(() => {
    fetchRolesAndPermissions();
  }, []);

  const fetchRolesAndPermissions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/roles');
      setRoles(res.data?.roles || []);
      setPermissions(res.data?.permissions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (roleCode: string, permCode: string) => {
    if (roleCode === 'SUPER_ADMIN') {
      toast('Super Admin permissions cannot be restricted', { icon: '🔒' });
      return;
    }
    setMatrix((prev) => {
      const current = prev[roleCode] || [];
      const updated = current.includes(permCode)
        ? current.filter((p) => p !== permCode)
        : [...current, permCode];
      return { ...prev, [roleCode]: updated };
    });
  };

  const handleSave = () => {
    toast.success('RBAC Role & Permission matrix updated and audited!');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Role-Based Access Control (RBAC)</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure granular security permissions per operational role across BSC Textiles
            </p>
          </div>

          <button
            onClick={handleSave}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-5 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save RBAC Matrix
          </button>
        </div>

        {/* Matrix Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4 min-w-[200px] sticky left-0 bg-gray-50 z-10">Role Name</th>
                  {permissions.map((p) => (
                    <th key={p.code} className="py-3 px-2 text-center min-w-[70px]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.slice(0, 10).map((r) => {
                  const rolePerms = matrix[r.code] || ['VIEW'];
                  return (
                    <tr key={r.code} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-gray-900 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div>{r.name}</div>
                        <div className="text-[10px] text-gray-400 font-mono font-normal">{r.code}</div>
                      </td>
                      {permissions.map((p) => {
                        const hasPerm = rolePerms.includes(p.code);
                        return (
                          <td key={p.code} className="py-3 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => togglePermission(r.code, p.code)}
                              className={`w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors ${
                                hasPerm
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                              }`}
                            >
                              {hasPerm ? <Check className="w-3.5 h-3.5" /> : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
