/**
 * CRM ingest. Each adapter pulls raw lead records from one CRM; normalizeLead turns them into the
 * shared CrmLead shape and upsertLeads writes them into the pipeline. To plug in a real CRM, add an
 * adapter whose fetchLeads calls that CRM's API (credentials as Worker secrets on Env), or push
 * records to POST /api/pipeline/ingest from a webhook or Zapier.
 */
import { addDays, type Env } from "./util";

export type CrmAdapter = {
  id: string;
  label: string;
  blurb: string;
  /** False until the adapter has credentials and a real fetch. */
  ready: (env: Env) => boolean;
  fetchLeads: (env: Env, therapistId: string, today: string) => Promise<Record<string, unknown>[]>;
};

const notConnected = async (): Promise<Record<string, unknown>[]> => {
  throw new Error("Not connected");
};

/**
 * Stand-in for whatever CRM the coach uses today. Records are shaped like a typical CRM export
 * (first/last name, deal stage words, lead source) so the normalizer does real work. IDs are stable,
 * so importing twice updates the same leads instead of duplicating them.
 */
const sample: CrmAdapter = {
  id: "sample",
  label: "Sample CRM",
  blurb: "Six realistic leads to try the import with",
  ready: () => true,
  fetchLeads: async (_env, _therapistId, t) => [
    { id: "crm-1042", first_name: "Rosa", last_name: "Delgado", email: "rosa.delgado@example.com", phone: "(415) 555-0142", lead_source: "Website form", stage: "New", goal: "Shoulder pain from swimming", notes: "Swims 4x a week, wants to keep training.", amount: 400, created_at: addDays(t, -1) },
    { id: "crm-1043", first_name: "Marcus", last_name: "Hale", email: "marcus.hale@example.com", lead_source: "Instagram DM", stage: "Intro call booked", goal: "Hamstring strain, sprinter", pitch_at: addDays(t, 1) + "T16:30", amount: 450, created_at: addDays(t, -3) },
    { id: "crm-1044", first_name: "Elena", last_name: "Park", email: "elena.park@example.com", phone: "(415) 555-0177", lead_source: "Referral: Maya R.", stage: "Discovery", goal: "Post-surgery knee, cleared by surgeon", needs_at: addDays(t, 2) + "T12:00", amount: 400, created_at: addDays(t, -8) },
    { id: "crm-1045", first_name: "Dev", last_name: "Raman", email: "dev.raman@example.com", lead_source: "Google", stage: "Proposal sent", goal: "Desk posture and low back", notes: "Comparing with a local clinic. Follow up Friday.", amount: 300, created_at: addDays(t, -12) },
    { id: "crm-1046", first_name: "Hannah", last_name: "Fischer", email: "hannah.f@example.com", lead_source: "Gym partnership", stage: "New", goal: "Return to lifting after back tweak", created_at: addDays(t, 0) },
    { id: "crm-1047", first_name: "Omar", last_name: "Siddiqui", email: "omar.s@example.com", lead_source: "Website form", stage: "Closed lost", goal: "Plantar fasciitis", notes: "Went with in-person PT near work.", amount: 350, created_at: addDays(t, -20) },
  ],
};

export const ADAPTERS: CrmAdapter[] = [
  sample,
  { id: "hubspot", label: "HubSpot", blurb: "Contacts and deals", ready: () => false, fetchLeads: notConnected },
  { id: "gohighlevel", label: "GoHighLevel", blurb: "Opportunities pipeline", ready: () => false, fetchLeads: notConnected },
  { id: "pipedrive", label: "Pipedrive", blurb: "Deals and persons", ready: () => false, fetchLeads: notConnected },
];

export const adapter = (id: string) => ADAPTERS.find((a) => a.id === id);
