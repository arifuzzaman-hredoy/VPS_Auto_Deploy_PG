import type { DnsRecordPlan } from '@techteam/shared';

export interface DnsZone {
  id: string;
  name: string;
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
}

export interface VerifyCredentialsInput {
  credential: unknown;
}

export interface ListZonesInput {
  credential: unknown;
}

export interface ListRecordsInput {
  credential: unknown;
  zoneId: string;
  hostname: string;
}

export interface UpsertDnsRecordInput {
  credential: unknown;
  zoneId: string;
  record: DnsRecordPlan;
}

export interface DeleteDnsRecordInput {
  credential: unknown;
  zoneId: string;
  recordId: string;
}

export interface DnsProviderAdapter {
  provider: string;
  verifyCredentials(input: VerifyCredentialsInput): Promise<boolean>;
  listZones(input: ListZonesInput): Promise<DnsZone[]>;
  findZoneByDomain(domain: string, input: ListZonesInput): Promise<DnsZone | null>;
  listRecords(input: ListRecordsInput): Promise<DnsRecord[]>;
  upsertRecord(input: UpsertDnsRecordInput): Promise<DnsRecord>;
  deleteRecord(input: DeleteDnsRecordInput): Promise<void>;
}

export class UnsupportedDnsProviderError extends Error {
  constructor(provider: string) {
    super(`DNS provider is not implemented yet: ${provider}`);
  }
}
