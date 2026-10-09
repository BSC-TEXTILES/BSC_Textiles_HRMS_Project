/**
 * BSC Textiles HRMS — Native MySQL 8.0 Persistence Engine
 * Zero Prisma Dependency. High-Performance mysql2/promise driver.
 */

import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const connectionUri = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';

export const pool: Pool = mysql.createPool({
  uri: connectionUri,
  waitForConnections: true,
  connectionLimit: 25,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true,
  dateStrings: false,
  timezone: '+05:30',
  multipleStatements: true,
});

export class Decimal {
  private value: number;
  constructor(val: any) {
    this.value = typeof val === 'number' ? val : Number(val) || 0;
  }
  toNumber(): number {
    return this.value;
  }
  toString(): string {
    return String(this.value);
  }
  toFixed(dp?: number): string {
    return this.value.toFixed(dp);
  }
  valueOf(): number {
    return this.value;
  }
}

export type ReactionType = 'UPVOTE' | 'FLAG' | 'HEART' | 'CHECK' | string;

export const MODEL_TO_TABLE: Record<string, string> = {
  user: 'user',
  employee: 'employee',
  location: 'location',
  floor: 'floor',
  department: 'department',
  section: 'section',
  sellingPoint: 'sellingpoint',
  employeeSellingPoint: 'employeesellingpoint',
  employeeIncentive: 'employeeincentive',
  shift: 'shift',
  attendance: 'attendance',
  attendanceRules: 'attendancerules',
  breakRule: 'breakrule',
  employeeBreak: 'employeebreak',
  weeklyOffRule: 'weeklyoffrule',
  holiday: 'holiday',
  qRCode: 'qrcode',
  qRScanRecord: 'qrscanrecord',
  faceVerification: 'faceverification',
  incentiveRule: 'incentiverule',
  incentiveTransaction: 'incentivetransaction',
  penaltyRule: 'penaltyrule',
  penaltyTransaction: 'penaltytransaction',
  auditLog: 'auditlog',
  payrollRun: 'payrollrun',
  payrollItem: 'payrollitem',
  liveStream: 'livestream',
  liveStreamMessage: 'livestreammessage',
  liveStreamViewer: 'livestreamviewer',
  liveStreamReaction: 'livestreamreaction',
  observation: 'observation',
  observationAttachment: 'observationattachment',
  observationComment: 'observationcomment',
  observationReaction: 'observationreaction',
  streamObservation: 'streamobservation',
  streamTimestamp: 'streamtimestamp',
  notification: 'notification',
  device: 'device',
  faceProfile: 'faceprofile',
};

const RELATION_META: Record<
  string,
  Record<string, { table: string; foreignKey?: string; isMany?: boolean; parentKey?: string }>
> = {
  user: {
    location: { table: 'location', foreignKey: 'locationId' },
    employee: { table: 'employee', foreignKey: 'employeeId' },
  },
  employee: {
    location: { table: 'location', foreignKey: 'locationId' },
    floor: { table: 'floor', foreignKey: 'floorId' },
    department: { table: 'department', foreignKey: 'departmentId' },
    section: { table: 'section', foreignKey: 'sectionId' },
    shift: { table: 'shift', foreignKey: 'shiftId' },
    user: { table: 'user', parentKey: 'id', foreignKey: 'employeeId' },
  },
  location: {
    manager: { table: 'user', foreignKey: 'managerId' },
    hrManager: { table: 'user', foreignKey: 'hrManagerId' },
    floors: { table: 'floor', foreignKey: 'locationId', isMany: true },
    departments: { table: 'department', foreignKey: 'locationId', isMany: true },
    employees: { table: 'employee', foreignKey: 'locationId', isMany: true },
    sections: { table: 'section', foreignKey: 'locationId', isMany: true },
    sellingPoints: { table: 'sellingpoint', foreignKey: 'locationId', isMany: true },
  },
  floor: {
    location: { table: 'location', foreignKey: 'locationId' },
    floorManager: { table: 'user', foreignKey: 'floorManagerId' },
    assistantManager: { table: 'user', foreignKey: 'assistantManagerId' },
    departments: { table: 'department', foreignKey: 'floorId', isMany: true },
    sections: { table: 'section', foreignKey: 'floorId', isMany: true },
    sellingPoints: { table: 'sellingpoint', foreignKey: 'floorId', isMany: true },
  },
  department: {
    location: { table: 'location', foreignKey: 'locationId' },
    floor: { table: 'floor', foreignKey: 'floorId' },
    manager: { table: 'user', foreignKey: 'managerId' },
    sections: { table: 'section', foreignKey: 'departmentId', isMany: true },
    employees: { table: 'employee', foreignKey: 'departmentId', isMany: true },
  },
  section: {
    location: { table: 'location', foreignKey: 'locationId' },
    floor: { table: 'floor', foreignKey: 'floorId' },
    department: { table: 'department', foreignKey: 'departmentId' },
    supervisor: { table: 'user', foreignKey: 'supervisorId' },
    sellingPoints: { table: 'sellingpoint', foreignKey: 'sectionId', isMany: true },
    employees: { table: 'employee', foreignKey: 'sectionId', isMany: true },
  },
  sellingPoint: {
    location: { table: 'location', foreignKey: 'locationId' },
    floor: { table: 'floor', foreignKey: 'floorId' },
    section: { table: 'section', foreignKey: 'sectionId' },
    manager: { table: 'user', foreignKey: 'managerId' },
  },
  shift: {
    location: { table: 'location', foreignKey: 'locationId' },
    employees: { table: 'employee', foreignKey: 'shiftId', isMany: true },
  },
  attendance: {
    employee: { table: 'employee', foreignKey: 'employeeId' },
    location: { table: 'location', foreignKey: 'locationId' },
    shift: { table: 'shift', foreignKey: 'shiftId' },
    breaks: { table: 'employeebreak', foreignKey: 'attendanceId', isMany: true },
  },
  employeeBreak: {
    employee: { table: 'employee', foreignKey: 'employeeId' },
    attendance: { table: 'attendance', foreignKey: 'attendanceId' },
  },
  faceVerification: {
    employee: { table: 'employee', foreignKey: 'employeeId' },
    location: { table: 'location', foreignKey: 'locationId' },
  },
  qRCode: {
    employee: { table: 'employee', foreignKey: 'employeeId' },
    location: { table: 'location', foreignKey: 'locationId' },
  },
  qRScanRecord: {
    employee: { table: 'employee', foreignKey: 'employeeId' },
    location: { table: 'location', foreignKey: 'locationId' },
    qrCode: { table: 'qrcode', foreignKey: 'qrCodeId' },
    dailyQRCode: { table: 'qrcode', foreignKey: 'qrCodeId' },
  },
  payrollRun: {
    location: { table: 'location', foreignKey: 'locationId' },
    items: { table: 'payrollitem', foreignKey: 'payrollRunId', isMany: true },
  },
  payrollItem: {
    payrollRun: { table: 'payrollrun', foreignKey: 'payrollRunId' },
    employee: { table: 'employee', foreignKey: 'employeeId' },
  },
  observation: {
    employee: { table: 'employee', foreignKey: 'employeeId' },
    location: { table: 'location', foreignKey: 'locationId' },
    attachments: { table: 'observationattachment', foreignKey: 'observationId', isMany: true },
    comments: { table: 'observationcomment', foreignKey: 'observationId', isMany: true },
    reactions: { table: 'observationreaction', foreignKey: 'observationId', isMany: true },
    user: { table: 'user', foreignKey: 'observedBy' },
    uploadedBy: { table: 'user', foreignKey: 'observedBy' },
  },
  auditLog: {
    user: { table: 'user', foreignKey: 'userId' },
    location: { table: 'location', foreignKey: 'locationId' },
  },
  liveStream: {
    location: { table: 'location', foreignKey: 'locationId' },
    messages: { table: 'livestreammessage', foreignKey: 'streamId', isMany: true },
    reactions: { table: 'livestreamreaction', foreignKey: 'streamId', isMany: true },
    viewers: { table: 'livestreamviewer', foreignKey: 'streamId', isMany: true },
  },
};

const BOOLEAN_KEYS = new Set([
  'isActive',
  'isOverrun',
  'livenessConfirmed',
  'verified',
  'paid',
  'requiresFloorApproval',
  'requiresHRApproval',
  'isProcessed',
  'autoGenerated',
  'isMandatory',
  'allowSplitShift',
  'gracePeriodEnabled',
  'earlyLoginIncentiveEnabled',
  'overtimeEnabled',
  'halfDayAllowed',
  'sandwichRuleEnabled',
  'allowCarryForward',
  'encashable',
]);

function generateId(): string {
  return 'c' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

function normalizeRow(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (BOOLEAN_KEYS.has(k) && (v === 1 || v === 0)) {
      out[k] = v === 1;
    } else if (k === 'permissions' && typeof v === 'string') {
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

function buildWhereClause(
  modelName: string,
  whereObj: any,
  params: any[]
): string {
  if (!whereObj || Object.keys(whereObj).length === 0) return '';

  const conditions: string[] = [];

  for (const [key, val] of Object.entries(whereObj)) {
    if (val === undefined) continue;

    if (key === 'AND') {
      if (Array.isArray(val) && val.length > 0) {
        const sub = val
          .map((item) => buildWhereClause(modelName, item, params))
          .filter(Boolean);
        if (sub.length > 0) conditions.push(`(${sub.join(' AND ')})`);
      }
      continue;
    }

    if (key === 'OR') {
      if (Array.isArray(val) && val.length > 0) {
        const sub = val
          .map((item) => buildWhereClause(modelName, item, params))
          .filter(Boolean);
        if (sub.length > 0) conditions.push(`(${sub.join(' OR ')})`);
      }
      continue;
    }

    if (key === 'NOT') {
      const sub = buildWhereClause(modelName, val, params);
      if (sub) conditions.push(`NOT (${sub})`);
      continue;
    }

    // Check if key is a relation on the model
    const rels = RELATION_META[modelName];
    if (rels && rels[key] && typeof val === 'object' && val !== null && !(val instanceof Date)) {
      const relMeta = rels[key];
      const relTable = relMeta.table;
      const foreignKey = relMeta.foreignKey || `${key}Id`;
      const targetKey = relMeta.parentKey || 'id';

      const relParams: any[] = [];
      const relWhere = buildWhereClause(key, val, relParams);
      if (relWhere) {
        params.push(...relParams);
        conditions.push(`\`${foreignKey}\` IN (SELECT \`${targetKey}\` FROM \`${relTable}\` WHERE ${relWhere})`);
      }
      continue;
    }

    if (val === null) {
      conditions.push(`\`${key}\` IS NULL`);
      continue;
    }

    if (typeof val === 'object' && !(val instanceof Date)) {
      // Operator conditions
      if ('equals' in val) {
        if (val.equals === null) {
          conditions.push(`\`${key}\` IS NULL`);
        } else {
          conditions.push(`\`${key}\` = ?`);
          params.push(val.equals);
        }
      }
      if ('not' in val) {
        if (val.not === null) {
          conditions.push(`\`${key}\` IS NOT NULL`);
        } else {
          conditions.push(`\`${key}\` != ?`);
          params.push(val.not);
        }
      }
      if ('in' in val) {
        const list = Array.isArray(val.in) ? val.in : [];
        if (list.length === 0) {
          conditions.push('1 = 0');
        } else {
          const placeholders = list.map(() => '?').join(', ');
          conditions.push(`\`${key}\` IN (${placeholders})`);
          params.push(...list);
        }
      }
      if ('notIn' in val) {
        const list = Array.isArray(val.notIn) ? val.notIn : [];
        if (list.length === 0) {
          conditions.push('1 = 1');
        } else {
          const placeholders = list.map(() => '?').join(', ');
          conditions.push(`\`${key}\` NOT IN (${placeholders})`);
          params.push(...list);
        }
      }
      if ('gte' in val) {
        conditions.push(`\`${key}\` >= ?`);
        params.push(val.gte);
      }
      if ('gt' in val) {
        conditions.push(`\`${key}\` > ?`);
        params.push(val.gt);
      }
      if ('lte' in val) {
        conditions.push(`\`${key}\` <= ?`);
        params.push(val.lte);
      }
      if ('lt' in val) {
        conditions.push(`\`${key}\` < ?`);
        params.push(val.lt);
      }
      if ('contains' in val) {
        conditions.push(`\`${key}\` LIKE ?`);
        params.push(`%${val.contains}%`);
      }
      if ('startsWith' in val) {
        conditions.push(`\`${key}\` LIKE ?`);
        params.push(`${val.startsWith}%`);
      }
      if ('endsWith' in val) {
        conditions.push(`\`${key}\` LIKE ?`);
        params.push(`%${val.endsWith}`);
      }
      continue;
    }

    // Direct scalar equality
    if (BOOLEAN_KEYS.has(key) && typeof val === 'boolean') {
      conditions.push(`\`${key}\` = ?`);
      params.push(val ? 1 : 0);
    } else {
      conditions.push(`\`${key}\` = ?`);
      params.push(val);
    }
  }

  return conditions.length > 0 ? conditions.join(' AND ') : '';
}

function buildOrderBy(orderBy: any): string {
  if (!orderBy) return '';
  if (Array.isArray(orderBy)) {
    const parts = orderBy.map((item) => {
      const [k, dir] = Object.entries(item)[0];
      return `\`${k}\` ${String(dir).toUpperCase()}`;
    });
    return parts.length > 0 ? `ORDER BY ${parts.join(', ')}` : '';
  }
  if (typeof orderBy === 'object') {
    const parts = Object.entries(orderBy).map(([k, dir]) => {
      return `\`${k}\` ${String(dir).toUpperCase()}`;
    });
    return parts.length > 0 ? `ORDER BY ${parts.join(', ')}` : '';
  }
  return '';
}

async function resolveIncludes(
  modelName: string,
  rows: any[],
  include: any,
  select: any,
  client: any
): Promise<void> {
  if (!rows || rows.length === 0) return;
  const rels = RELATION_META[modelName] || {};
  const requested = { ...include };

  if (select) {
    for (const [k, v] of Object.entries(select)) {
      if (typeof v === 'object' && v !== null && (rels[k] || k === '_count')) {
        requested[k] = v;
      }
    }
  }

  for (const [relKey, relConfig] of Object.entries(requested)) {
    if (!relConfig) continue;

    if (relKey === '_count') {
      const countSelect = relConfig === true ? {} : ((relConfig as any)?.select || {});
      for (const row of rows) {
        row._count = row._count || {};
      }
      for (const [subRel] of Object.entries(countSelect)) {
        const subRelMeta = rels[subRel];
        if (subRelMeta) {
          const subTable = subRelMeta.table;
          const foreignKey = subRelMeta.foreignKey || `${modelName}Id`;
          const rowIds = rows.map((r) => r.id).filter(Boolean);
          if (rowIds.length > 0) {
            const placeholders = rowIds.map(() => '?').join(', ');
            const [counts]: any = await client.query(
              `SELECT \`${foreignKey}\` as fid, COUNT(*) as c FROM \`${subTable}\` WHERE \`${foreignKey}\` IN (${placeholders}) GROUP BY \`${foreignKey}\``,
              rowIds
            );
            const countMap = new Map<string, number>();
            for (const c of counts) {
              countMap.set(String(c.fid), Number(c.c));
            }
            for (const row of rows) {
              row._count[subRel] = countMap.get(String(row.id)) || 0;
            }
          }
        }
      }
      continue;
    }

    const relMeta = rels[relKey];
    if (!relMeta) continue;

    const targetTable = relMeta.table;
    const isMany = !!relMeta.isMany;

    if (isMany) {
      const foreignKey = relMeta.foreignKey || `${modelName}Id`;
      const parentIds = rows.map((r) => r.id).filter(Boolean);
      if (parentIds.length === 0) {
        for (const row of rows) row[relKey] = [];
        continue;
      }
      const placeholders = parentIds.map(() => '?').join(', ');
      const [childRows]: any = await client.query(
        `SELECT * FROM \`${targetTable}\` WHERE \`${foreignKey}\` IN (${placeholders})`,
        parentIds
      );
      const normalizedChildren = childRows.map(normalizeRow);

      const cfg = relConfig as any;
      if (typeof cfg === 'object' && cfg && (cfg.include || cfg.select)) {
        await resolveIncludes(
          relKey,
          normalizedChildren,
          cfg.include,
          cfg.select,
          client
        );
      }

      const map = new Map<string, any[]>();
      for (const child of normalizedChildren) {
        const pid = String(child[foreignKey]);
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(child);
      }
      for (const row of rows) {
        row[relKey] = map.get(String(row.id)) || [];
      }
    } else {
      const fk = relMeta.foreignKey || `${relKey}Id`;
      const parentKey = relMeta.parentKey || 'id';

      if (relMeta.parentKey) {
        const parentIds = rows.map((r) => r[parentKey]).filter(Boolean);
        if (parentIds.length === 0) {
          for (const row of rows) row[relKey] = null;
          continue;
        }
        const placeholders = parentIds.map(() => '?').join(', ');
        const [targetRows]: any = await client.query(
          `SELECT * FROM \`${targetTable}\` WHERE \`${fk}\` IN (${placeholders})`,
          parentIds
        );
        const normalizedTargets = targetRows.map(normalizeRow);
        const cfg = relConfig as any;
        if (typeof cfg === 'object' && cfg && (cfg.include || cfg.select)) {
          await resolveIncludes(
            relKey,
            normalizedTargets,
            cfg.include,
            cfg.select,
            client
          );
        }
        const map = new Map<string, any>();
        for (const target of normalizedTargets) {
          map.set(String(target[fk]), target);
        }
        for (const row of rows) {
          row[relKey] = map.get(String(row[parentKey])) || null;
        }
      } else {
        const fks = rows.map((r) => r[fk]).filter(Boolean);
        if (fks.length === 0) {
          for (const row of rows) row[relKey] = null;
          continue;
        }
        const placeholders = fks.map(() => '?').join(', ');
        const [targetRows]: any = await client.query(
          `SELECT * FROM \`${targetTable}\` WHERE \`id\` IN (${placeholders})`,
          fks
        );
        const normalizedTargets = targetRows.map(normalizeRow);
        const cfg = relConfig as any;
        if (typeof cfg === 'object' && cfg && (cfg.include || cfg.select)) {
          await resolveIncludes(
            relKey,
            normalizedTargets,
            cfg.include,
            cfg.select,
            client
          );
        }
        const map = new Map<string, any>();
        for (const target of normalizedTargets) {
          map.set(String(target.id), target);
        }
        for (const row of rows) {
          row[relKey] = map.get(String(row[fk])) || null;
        }
      }
    }
  }
}

function applySelect(row: any, select: any): any {
  if (!row || !select || typeof select !== 'object') return row;
  const out: any = {};
  for (const [k, v] of Object.entries(select)) {
    if (v) {
      out[k] = row[k];
    }
  }
  return out;
}

export class ModelDelegate {
  constructor(
    private modelName: string,
    private tableName: string,
    private getClient: () => Promise<any>
  ) {}

  async findUnique(args: { where: any; select?: any; include?: any }): Promise<any | null> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);
    const sql = `SELECT * FROM \`${this.tableName}\` ${whereSql ? `WHERE ${whereSql}` : ''} LIMIT 1`;
    const [rows]: any = await client.query(sql, params);
    if (!rows || rows.length === 0) return null;
    const row = normalizeRow(rows[0]);
    if (args.include || args.select) {
      await resolveIncludes(this.modelName, [row], args.include, args.select, client);
    }
    return args.select ? applySelect(row, args.select) : row;
  }

  async findFirst(args: {
    where?: any;
    select?: any;
    include?: any;
    orderBy?: any;
  } = {}): Promise<any | null> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);
    const orderSql = buildOrderBy(args.orderBy);
    const sql = `SELECT * FROM \`${this.tableName}\` ${whereSql ? `WHERE ${whereSql}` : ''} ${orderSql} LIMIT 1`;
    const [rows]: any = await client.query(sql, params);
    if (!rows || rows.length === 0) return null;
    const row = normalizeRow(rows[0]);
    if (args.include || args.select) {
      await resolveIncludes(this.modelName, [row], args.include, args.select, client);
    }
    return args.select ? applySelect(row, args.select) : row;
  }

  async findMany(args: {
    where?: any;
    select?: any;
    include?: any;
    orderBy?: any;
    skip?: number;
    take?: number;
  } = {}): Promise<any[]> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);
    const orderSql = buildOrderBy(args.orderBy);
    let limitSql = '';
    if (args.take !== undefined) {
      const take = Number(args.take);
      const skip = Number(args.skip || 0);
      limitSql = `LIMIT ${take} OFFSET ${skip}`;
    } else if (args.skip !== undefined) {
      limitSql = `LIMIT 18446744073709551615 OFFSET ${Number(args.skip)}`;
    }

    const sql = `SELECT * FROM \`${this.tableName}\` ${whereSql ? `WHERE ${whereSql}` : ''} ${orderSql} ${limitSql}`.trim();
    const [rawRows]: any = await client.query(sql, params);
    const rows = rawRows.map(normalizeRow);

    if (args.include || args.select) {
      await resolveIncludes(this.modelName, rows, args.include, args.select, client);
    }

    if (args.select) {
      return rows.map((r: any) => applySelect(r, args.select));
    }
    return rows;
  }

  async count(args: { where?: any } = {}): Promise<number> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);
    const sql = `SELECT COUNT(*) AS total FROM \`${this.tableName}\` ${whereSql ? `WHERE ${whereSql}` : ''}`;
    const [rows]: any = await client.query(sql, params);
    return Number(rows[0]?.total || 0);
  }

  async create(args: { data: any; select?: any; include?: any }): Promise<any> {
    const client = await this.getClient();
    const data = { ...args.data };
    if (!data.id) {
      data.id = generateId();
    }
    if (!data.createdAt && !data.created_at) {
      data.createdAt = new Date();
    }
    if (!data.updatedAt && !data.updated_at) {
      data.updatedAt = new Date();
    }

    const keys: string[] = [];
    const values: any[] = [];

    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v)) {
        if ('create' in v || 'connect' in v) continue;
      }
      keys.push(`\`${k}\``);
      if (Array.isArray(v)) {
        values.push(JSON.stringify(v));
      } else if (typeof v === 'boolean') {
        values.push(v ? 1 : 0);
      } else {
        values.push(v);
      }
    }

    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO \`${this.tableName}\` (${keys.join(', ')}) VALUES (${placeholders})`;
    await client.query(sql, values);

    return this.findUnique({
      where: { id: data.id },
      select: args.select,
      include: args.include,
    });
  }

  async createMany(args: { data: any[] }): Promise<{ count: number }> {
    const client = await this.getClient();
    let count = 0;
    for (const item of args.data) {
      await this.create({ data: item });
      count++;
    }
    return { count };
  }

  async update(args: { where: any; data: any; select?: any; include?: any }): Promise<any> {
    const client = await this.getClient();
    const existing = await this.findFirst({ where: args.where });
    if (!existing) {
      throw new Error(`Record to update not found in ${this.modelName}`);
    }

    const data = { ...args.data };
    data.updatedAt = new Date();

    const setClauses: string[] = [];
    const values: any[] = [];

    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v)) {
        if ('increment' in v) {
          setClauses.push(`\`${k}\` = \`${k}\` + ?`);
          values.push(v.increment);
          continue;
        }
        if ('decrement' in v) {
          setClauses.push(`\`${k}\` = \`${k}\` - ?`);
          values.push(v.decrement);
          continue;
        }
      }
      setClauses.push(`\`${k}\` = ?`);
      if (Array.isArray(v)) {
        values.push(JSON.stringify(v));
      } else if (typeof v === 'boolean') {
        values.push(v ? 1 : 0);
      } else {
        values.push(v);
      }
    }

    if (setClauses.length > 0) {
      values.push(existing.id);
      const sql = `UPDATE \`${this.tableName}\` SET ${setClauses.join(', ')} WHERE \`id\` = ?`;
      await client.query(sql, values);
    }

    return this.findUnique({
      where: { id: existing.id },
      select: args.select,
      include: args.include,
    });
  }

  async updateMany(args: { where: any; data: any }): Promise<{ count: number }> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);

    const setClauses: string[] = [];
    const setValues: any[] = [];

    for (const [k, v] of Object.entries(args.data)) {
      if (v === undefined) continue;
      setClauses.push(`\`${k}\` = ?`);
      if (Array.isArray(v)) {
        setValues.push(JSON.stringify(v));
      } else if (typeof v === 'boolean') {
        setValues.push(v ? 1 : 0);
      } else {
        setValues.push(v);
      }
    }

    if (setClauses.length === 0) return { count: 0 };

    const sql = `UPDATE \`${this.tableName}\` SET ${setClauses.join(', ')} ${whereSql ? `WHERE ${whereSql}` : ''}`;
    const [result]: any = await client.query(sql, [...setValues, ...params]);
    return { count: Number(result?.affectedRows || 0) };
  }

  async delete(args: { where: any }): Promise<any> {
    const client = await this.getClient();
    const existing = await this.findFirst({ where: args.where });
    if (!existing) {
      throw new Error(`Record to delete not found in ${this.modelName}`);
    }
    await client.query(`DELETE FROM \`${this.tableName}\` WHERE \`id\` = ?`, [existing.id]);
    return existing;
  }

  async deleteMany(args: { where?: any } = {}): Promise<{ count: number }> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);
    const sql = `DELETE FROM \`${this.tableName}\` ${whereSql ? `WHERE ${whereSql}` : ''}`;
    const [result]: any = await client.query(sql, params);
    return { count: Number(result?.affectedRows || 0) };
  }

  async upsert(args: { where: any; update: any; create: any; select?: any; include?: any }): Promise<any> {
    const existing = await this.findFirst({ where: args.where });
    if (existing) {
      return this.update({
        where: { id: existing.id },
        data: args.update,
        select: args.select,
        include: args.include,
      });
    } else {
      return this.create({
        data: args.create,
        select: args.select,
        include: args.include,
      });
    }
  }

  async aggregate(args: {
    where?: any;
    _avg?: Record<string, boolean>;
    _sum?: Record<string, boolean>;
    _count?: boolean | Record<string, boolean>;
    _min?: Record<string, boolean>;
    _max?: Record<string, boolean>;
  }): Promise<any> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);

    const selectParts: string[] = [];

    if (args._count) {
      selectParts.push('COUNT(*) AS `_count`');
    }
    if (args._avg) {
      for (const [col, enabled] of Object.entries(args._avg)) {
        if (enabled) selectParts.push(`AVG(\`${col}\`) AS \`_avg_${col}\``);
      }
    }
    if (args._sum) {
      for (const [col, enabled] of Object.entries(args._sum)) {
        if (enabled) selectParts.push(`SUM(\`${col}\`) AS \`_sum_${col}\``);
      }
    }
    if (args._min) {
      for (const [col, enabled] of Object.entries(args._min)) {
        if (enabled) selectParts.push(`MIN(\`${col}\`) AS \`_min_${col}\``);
      }
    }
    if (args._max) {
      for (const [col, enabled] of Object.entries(args._max)) {
        if (enabled) selectParts.push(`MAX(\`${col}\`) AS \`_max_${col}\``);
      }
    }

    if (selectParts.length === 0) selectParts.push('COUNT(*) AS `_count`');

    const sql = `SELECT ${selectParts.join(', ')} FROM \`${this.tableName}\` ${whereSql ? `WHERE ${whereSql}` : ''}`;
    const [rows]: any = await client.query(sql, params);
    const row = rows[0] || {};

    const out: any = {};
    if (args._count) {
      out._count = Number(row._count || 0);
    }
    if (args._avg) {
      out._avg = {};
      for (const col of Object.keys(args._avg)) {
        out._avg[col] = row[`_avg_${col}`] !== null ? Number(row[`_avg_${col}`]) : null;
      }
    }
    if (args._sum) {
      out._sum = {};
      for (const col of Object.keys(args._sum)) {
        out._sum[col] = row[`_sum_${col}`] !== null ? Number(row[`_sum_${col}`]) : null;
      }
    }
    if (args._min) {
      out._min = {};
      for (const col of Object.keys(args._min)) {
        out._min[col] = row[`_min_${col}`];
      }
    }
    if (args._max) {
      out._max = {};
      for (const col of Object.keys(args._max)) {
        out._max[col] = row[`_max_${col}`];
      }
    }
    return out;
  }

  async groupBy(args: {
    by: string[];
    where?: any;
    _count?: boolean | Record<string, boolean>;
    _sum?: Record<string, boolean>;
  }): Promise<any[]> {
    const client = await this.getClient();
    const params: any[] = [];
    const whereSql = buildWhereClause(this.modelName, args.where, params);
    const byFields = args.by.map((f) => `\`${f}\``).join(', ');

    const selects = [...args.by.map((f) => `\`${f}\``)];
    if (args._count) {
      selects.push('COUNT(*) AS `_count`');
    }
    if (args._sum) {
      for (const [col, enabled] of Object.entries(args._sum)) {
        if (enabled) selects.push(`SUM(\`${col}\`) AS \`_sum_${col}\``);
      }
    }

    const sql = `SELECT ${selects.join(', ')} FROM \`${this.tableName}\` ${whereSql ? `WHERE ${whereSql}` : ''} GROUP BY ${byFields}`;
    const [rows]: any = await client.query(sql, params);

    return rows.map((r: any) => {
      const item: any = {};
      for (const f of args.by) item[f] = r[f];
      if (args._count) item._count = Number(r._count || 0);
      if (args._sum) {
        item._sum = {};
        for (const col of Object.keys(args._sum)) {
          item._sum[col] = r[`_sum_${col}`] !== null ? Number(r[`_sum_${col}`]) : null;
        }
      }
      return item;
    });
  }
}

class NativeMySQLClient {
  private delegates = new Map<string, ModelDelegate>();

  constructor(private connectionGetter: () => Promise<any> = async () => pool) {}

  getModel(modelName: string): ModelDelegate {
    if (!this.delegates.has(modelName)) {
      const tableName = MODEL_TO_TABLE[modelName] || modelName.toLowerCase();
      this.delegates.set(
        modelName,
        new ModelDelegate(modelName, tableName, this.connectionGetter)
      );
    }
    return this.delegates.get(modelName)!;
  }

  async $queryRaw(query: any, ...values: any[]): Promise<any> {
    const client = await this.connectionGetter();
    let sql = query;
    let params = values;
    if (Array.isArray(query) || (query && query.raw)) {
      sql = Array.isArray(query) ? query.join('?') : query.sql;
      params = query.values || values;
    }
    const [rows]: any = await client.query(sql, params);
    return rows;
  }

  async $executeRaw(query: any, ...values: any[]): Promise<any> {
    const client = await this.connectionGetter();
    let sql = query;
    let params = values;
    if (Array.isArray(query) || (query && query.raw)) {
      sql = Array.isArray(query) ? query.join('?') : query.sql;
      params = query.values || values;
    }
    const [result]: any = await client.query(sql, params);
    return result?.affectedRows || 0;
  }

  async $transaction(input: any[] | ((tx: any) => Promise<any>)): Promise<any> {
    if (Array.isArray(input)) {
      return Promise.all(input);
    }
    if (typeof input === 'function') {
      const conn: PoolConnection = await pool.getConnection();
      await conn.beginTransaction();
      try {
        const txClient = new NativeMySQLClient(async () => conn);
        const proxy = createProxyClient(txClient);
        const result = await input(proxy);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
    throw new Error('Unsupported transaction input');
  }
}

function createProxyClient(nativeClient: NativeMySQLClient): any {
  return new Proxy(nativeClient, {
    get(target, prop: string) {
      if (prop in target) {
        return (target as any)[prop];
      }
      return target.getModel(prop);
    },
  });
}

const rootClient = new NativeMySQLClient();
export const prisma: any = createProxyClient(rootClient);
export default prisma;
