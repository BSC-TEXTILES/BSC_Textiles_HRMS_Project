import { EmployeeRepository, EmployeeEntity } from '../repositories/EmployeeRepository.js';

export class EmployeeService {
  constructor(private readonly employeeRepo: EmployeeRepository) {}

  public async getEmployeeById(id: string): Promise<EmployeeEntity | null> {
    return this.employeeRepo.findById(id);
  }

  public async getEmployeeByCode(code: string): Promise<EmployeeEntity | null> {
    return this.employeeRepo.findByCode(code);
  }

  public async getActiveEmployees(locationId?: string): Promise<EmployeeEntity[]> {
    return this.employeeRepo.listActive(locationId);
  }

  public async getFormerEmployees(options: {
    locationId?: string;
    departmentId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ employees: EmployeeEntity[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.max(1, Number(options.limit || 20));
    const offset = (page - 1) * limit;

    const { employees, total } = await this.employeeRepo.listFormerEmployees({
      locationId: options.locationId,
      departmentId: options.departmentId,
      status: options.status,
      search: options.search,
      limit,
      offset,
    });

    return { employees, total, page, limit };
  }
}
