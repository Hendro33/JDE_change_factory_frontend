import { api } from "./api";
import { request, downloadFile } from "./httpApi";

// Validation keeps the server's versioned document keys unchanged.
export type RecordData = Record<string, any>;
export async function validationRequest<T = RecordData>(
  path = "",
  body?: unknown,
  method?: "POST" | "PUT",
): Promise<T> {
  const session = await api.getSession();
  return request<T>("/validation" + path, {
    customerId: session.activeCustomerId,
    method: method ?? (body === undefined ? "GET" : "POST"),
    body,
  });
}
export async function validationEvidence(id: string) {
  const session = await api.getSession();
  const metadata = await validationRequest(
    "/evidence/" + encodeURIComponent(id) + "/info",
  );
  const extension: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "application/pdf": "pdf",
    "application/json": "json",
    "text/plain": "txt",
  };
  return downloadFile(
    "/validation/evidence/" + encodeURIComponent(id),
    session.activeCustomerId,
    id + "." + (extension[metadata.mime] ?? "bin"),
  );
}
export const latest = (record: RecordData): RecordData =>
  record.versions[record.versions.length - 1];
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export async function validationReport(planId: string) {
  const session = await api.getSession();
  return downloadFile(
    "/validation/plans/" + encodeURIComponent(planId) + "/report",
    session.activeCustomerId,
    "jade-validation-report.zip",
  );
}

export async function validationStart(body: RecordData) {
  const session = await api.getSession();
  const requestBody = { ...body };
  delete requestBody.idempotency_key;
  const signature =
    "jade-validation-start:" +
    session.activeCustomerId +
    ":" +
    JSON.stringify(requestBody);
  const operation = sessionStorage.getItem(signature) ?? crypto.randomUUID();
  sessionStorage.setItem(signature, operation);
  const result = await request<RecordData>("/validation/runs", {
    customerId: session.activeCustomerId,
    method: "POST",
    body: { ...requestBody, idempotency_key: operation },
  });
  sessionStorage.removeItem(signature);
  return result;
}
