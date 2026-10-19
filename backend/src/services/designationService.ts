import { pool } from '../nativeDb.js';

export interface DesignationItem {
  id: string;
  title: string;
  code: string | null;
  grade: string;
  band: string;
  minSalary: number;
  maxSalary: number;
  description: string;
  icon: string;
  department: string | null;
  aliases: string | null;
  count: number;
  avgSalary: number;
  departmentNames: string[];
  employees: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    designation: string;
    departmentName: string;
    locationName: string;
    locationCode: string;
    status: string;
    gender: string | null;
    phone: string | null;
    email: string | null;
    joiningDate: string | null;
    baseSalary: number;
    avatarUrl: string | null;
  }>;
}

export async function getAllDesignations(): Promise<{
  designations: DesignationItem[];
  kpis: {
    totalRoles: number;
    totalStaffMapped: number;
    totalEmployees: number;
    coveragePct: number;
    minCompensation: number;
    maxCompensation: number;
  };
}> {
  const [desigRows]: any = await pool.query(
    `SELECT id, title, code, grade, band, minSalary, maxSalary, description, icon, department, aliases
       FROM designations
      WHERE isActive = 1
      ORDER BY minSalary DESC`
  );

  const [empRows]: any = await pool.query(
    `SELECT e.id, e.employeeCode, e.fullName, e.designation, e.gender, e.phone, e.email,
            COALESCE(e.basicSalary, e.fixedGrossSalary, 25000) as baseSalary, e.status, e.joiningDate, e.photoReference,
            COALESCE(dept.name, 'Retail Operations') as departmentName,
            COALESCE(loc.name, 'Belagavi Head Store') as locationName,
            COALESCE(loc.code, 'BEL') as locationCode
       FROM employee e
       LEFT JOIN department dept ON dept.id = e.departmentId
       LEFT JOIN location loc ON loc.id = e.locationId
      WHERE e.status = 'ACTIVE'
      ORDER BY e.fullName ASC`
  );

  const assignedEmployees = new Set<string>();

  const result: DesignationItem[] = desigRows.map((d: any) => {
    const aliasList = (d.aliases ? d.aliases.split(',') : [])
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);
    aliasList.push(d.title.trim().toLowerCase());

    const matchedEmps = empRows.filter((e: any) => {
      const empDesig = (e.designation || '').trim().toLowerCase();
      if (!empDesig) return false;
      return aliasList.some((alias: string) => empDesig === alias || empDesig.includes(alias) || alias.includes(empDesig));
    });

    matchedEmps.forEach((e: any) => assignedEmployees.add(e.id));

    const totalSalary = matchedEmps.reduce((acc: number, curr: any) => acc + Number(curr.baseSalary || 0), 0);
    const avgSalary = matchedEmps.length > 0 ? Math.round(totalSalary / matchedEmps.length) : Math.round((d.minSalary + d.maxSalary) / 2);
    const deptNames = Array.from(new Set(matchedEmps.map((e: any) => e.departmentName).filter(Boolean))) as string[];

    return {
      id: d.id,
      title: d.title,
      code: d.code,
      grade: d.grade,
      band: d.band,
      minSalary: Number(d.minSalary),
      maxSalary: Number(d.maxSalary),
      description: d.description || '',
      icon: d.icon || 'badge',
      department: d.department,
      aliases: d.aliases,
      count: matchedEmps.length,
      avgSalary,
      departmentNames: deptNames,
      employees: matchedEmps.map((e: any) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        designation: e.designation,
        departmentName: e.departmentName,
        locationName: e.locationName,
        locationCode: e.locationCode,
        status: e.status,
        gender: e.gender,
        phone: e.phone,
        email: e.email,
        joiningDate: e.joiningDate ? new Date(e.joiningDate).toISOString().slice(0, 10) : null,
        baseSalary: Number(e.baseSalary),
        avatarUrl: e.photoReference
          ? (String(e.photoReference).startsWith('http') || String(e.photoReference).startsWith('/')
              ? String(e.photoReference)
              : `/${String(e.photoReference).replace(/^\/+/, '')}`)
          : null,
      })),
    };
  });

  const totalEmployees = empRows.length;
  const totalStaffMapped = assignedEmployees.size;
  const coveragePct = totalEmployees > 0 ? Math.round((totalStaffMapped / totalEmployees) * 100) : 100;

  const minCompensation = Math.min(...result.map((r) => r.minSalary), 16000);
  const maxCompensation = Math.max(...result.map((r) => r.maxSalary), 120000);

  return {
    designations: result,
    kpis: {
      totalRoles: result.length,
      totalStaffMapped,
      totalEmployees,
      coveragePct,
      minCompensation,
      maxCompensation,
    },
  };
}

export async function createDesignation(data: {
  title: string;
  grade: string;
  band?: string;
  minSalary?: number;
  maxSalary?: number;
  description?: string;
  icon?: string;
  department?: string;
}): Promise<void> {
  const id = `desig_${Date.now()}`;
  const minSal = Number(data.minSalary) || 25000;
  const maxSal = Number(data.maxSalary) || 40000;
  const band = data.band || `₹${(minSal / 1000).toFixed(0)}K – ₹${(maxSal / 1000).toFixed(0)}K`;

  await pool.query(
    `INSERT INTO designations (id, title, grade, band, minSalary, maxSalary, description, icon, department, aliases, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      data.title.trim(),
      data.grade.trim(),
      band,
      minSal,
      maxSal,
      data.description?.trim() || 'Role in retail workforce',
      data.icon || 'badge',
      data.department?.trim() || 'Retail Operations',
      data.title.trim(),
    ]
  );
}

export async function updateDesignation(
  id: string,
  data: {
    title?: string;
    grade?: string;
    band?: string;
    minSalary?: number;
    maxSalary?: number;
    description?: string;
    icon?: string;
    department?: string;
  }
): Promise<void> {
  const fields: string[] = [];
  const params: any[] = [];

  if (data.title) {
    fields.push('title = ?');
    params.push(data.title.trim());
  }
  if (data.grade) {
    fields.push('grade = ?');
    params.push(data.grade.trim());
  }
  if (data.band) {
    fields.push('band = ?');
    params.push(data.band.trim());
  }
  if (data.minSalary !== undefined) {
    fields.push('minSalary = ?');
    params.push(Number(data.minSalary));
  }
  if (data.maxSalary !== undefined) {
    fields.push('maxSalary = ?');
    params.push(Number(data.maxSalary));
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    params.push(data.description.trim());
  }
  if (data.icon) {
    fields.push('icon = ?');
    params.push(data.icon.trim());
  }
  if (data.department) {
    fields.push('department = ?');
    params.push(data.department.trim());
  }

  if (fields.length === 0) return;

  params.push(id);
  await pool.query(`UPDATE designations SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function deleteDesignation(id: string): Promise<void> {
  await pool.query(`UPDATE designations SET isActive = 0 WHERE id = ?`, [id]);
}

export async function assignEmployeeDesignation(employeeId: string, designationTitle: string): Promise<void> {
  await pool.query(`UPDATE employee SET designation = ? WHERE id = ?`, [designationTitle.trim(), employeeId]);
}
