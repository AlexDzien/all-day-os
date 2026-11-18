/* The demo API intentionally exposes records from several ERP domains. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Entity = { id: string; [key: string]: any };
export type DemoState = {
  meta: { company: string; mode: string; date: string; currency: string; [key: string]: any };
  stats: Record<string, number>;
  revenue_series: Entity[];
  customers: Entity[]; deals: Entity[]; messages: Entity[]; campaigns: Entity[];
  tasks: Entity[]; team: Entity[]; audit: Entity[]; products: Entity[];
  offers: Entity[]; orders: Entity[]; invoices: Entity[]; licenses: Entity[];
  projects: Entity[]; documents: Entity[]; automations: Entity[];
  ai: { sources: Entity[]; history: Entity[] };
  [key: string]: any;
};
export type Action = (type: string, payload?: Record<string, unknown>) => Promise<any>;
export type Navigate = (page: string, id?: string) => void;
export type Notify = (message: string, tone?: "success" | "error" | "info") => void;
