export interface StoreHubItem {
  id: string;
  code: string;
  name: string;
  location: string;
  city: string;
  address: string;
  totalEmployees: number;
  activeOnFloor: number;
  departmentsAvailable: string;
  terminalCount: number;
  managerName: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export const CANONICAL_HUB_STORES: StoreHubItem[] = [
  {
    id: 'loc_bel',
    code: 'BEL',
    name: 'Belagavi Head Store',
    location: 'Khade Bazar, Belagavi',
    city: 'Belagavi',
    address: 'Khade Bazar, Belagavi, Karnataka 590001',
    totalEmployees: 23,
    activeOnFloor: 7,
    departmentsAvailable: '6 Units (Silk, Men, Women, Ops, HR, Fin)',
    terminalCount: 4,
    managerName: 'Kavita Bhat (HR & Store In-Charge)',
    status: 'ACTIVE',
  },
  {
    id: 'loc_dav',
    code: 'DAV',
    name: 'Davanagere Mega Store',
    location: 'P.B. Road, Davanagere',
    city: 'Davanagere',
    address: 'P.B. Road, Davanagere, Karnataka 577002',
    totalEmployees: 8,
    activeOnFloor: 3,
    departmentsAvailable: '6 Units (Retail Sales, Ops, Accounts)',
    terminalCount: 3,
    managerName: 'Suresh Patil (Store Manager)',
    status: 'ACTIVE',
  },
  {
    id: 'loc_shi',
    code: 'SHI',
    name: 'Shivamogga Flagship',
    location: 'Nehru Road, Shivamogga',
    city: 'Shivamogga',
    address: 'Nehru Road, Shivamogga, Karnataka 577201',
    totalEmployees: 7,
    activeOnFloor: 2,
    departmentsAvailable: '6 Units (Showroom, Logistics, HR)',
    terminalCount: 3,
    managerName: 'Vikram Singh (Regional HR Manager)',
    status: 'ACTIVE',
  },
];
