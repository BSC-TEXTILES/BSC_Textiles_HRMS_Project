import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../nativeDb.js';

export class UserUploadService {
  /**
   * Returns all upload root directories to guarantee d:\BSC Textiles HRMS\uploads is always targeted.
   */
  public static getUploadDirs(): string[] {
    const dirs: string[] = [];
    const cwdUploads = path.resolve(process.cwd(), 'uploads');
    const parentUploads = path.resolve(process.cwd(), '..', 'uploads');

    dirs.push(cwdUploads);
    if (fs.existsSync(path.resolve(process.cwd(), '..', 'package.json'))) {
      dirs.push(parentUploads);
    }
    return Array.from(new Set(dirs));
  }

  /**
   * Sanitize user or employee name for safe filesystem directory naming.
   */
  public static sanitizeName(fullName: string): string {
    if (!fullName || !fullName.trim()) return 'User';
    return fullName.trim().replace(/[/\\?%*:|"<>]/g, '_');
  }

  /**
   * Create dedicated folder for user with his name in uploads directory.
   */
  public static ensureUserFolder(fullName: string, employeeCode?: string): string[] {
    const safeName = this.sanitizeName(fullName);
    const createdPaths: string[] = [];
    const rootDirs = this.getUploadDirs();

    for (const root of rootDirs) {
      try {
        if (!fs.existsSync(root)) {
          fs.mkdirSync(root, { recursive: true });
        }

        // Dedicated folder named with the user's name: e.g. "Rajesh Kumar"
        const userFolder = path.join(root, safeName);
        if (!fs.existsSync(userFolder)) {
          fs.mkdirSync(userFolder, { recursive: true });
        }

        // Subfolders for organized user storage
        const subfolders = ['documents', 'kyc', 'photos', 'receipts'];
        for (const sub of subfolders) {
          const subPath = path.join(userFolder, sub);
          if (!fs.existsSync(subPath)) {
            fs.mkdirSync(subPath, { recursive: true });
          }
        }

        createdPaths.push(userFolder);
      } catch (err: any) {
        console.warn(`[UserUploadService] Could not create folder for ${fullName} in ${root}:`, err.message);
      }
    }

    return createdPaths;
  }

  /**
   * Synchronize all existing employees and users in the database to ensure
   * every single user has a folder with his/her name in uploads.
   */
  public static async syncAllUserFolders(): Promise<number> {
    try {
      const [employees]: any = await pool.query('SELECT fullName, employeeCode FROM employee');
      const [users]: any = await pool.query('SELECT fullName FROM user');

      const names = new Set<string>();

      if (Array.isArray(employees)) {
        for (const emp of employees) {
          if (emp.fullName) names.add(emp.fullName);
        }
      }

      if (Array.isArray(users)) {
        for (const u of users) {
          if (u.fullName) names.add(u.fullName);
        }
      }

      for (const name of names) {
        this.ensureUserFolder(name);
      }

      console.log(`✓ Synchronized uploads folders for ${names.size} users/employees.`);
      return names.size;
    } catch (err: any) {
      console.warn('[UserUploadService] Sync error:', err.message);
      return 0;
    }
  }
}
