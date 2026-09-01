const WORKER_URL = (import.meta.env.VITE_R2_WORKER_URL as string) || '';

export type OfficePreviewResult =
  | { status: 'ready'; pdf: Blob }
  | { status: 'queued' | 'processing'; retryAfterSeconds: number }
  | { status: 'failed'; errorCode: string };

async function responseError(response: Response): Promise<Error> {
  let message = `تعذر الاتصال بخدمة المعاينة (${response.status})`;
  try {
    const body = await response.json() as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // Keep the safe status-based message for non-JSON responses.
  }
  return new Error(message);
}

/**
 * Request the private PDF preview for an Office document. The first request
 * starts the asynchronous conversion; later requests stream the cached PDF.
 * No R2 URL or storage credential is exposed to the browser.
 */
export async function requestOfficePreview(
  accessToken: string,
  fileId: string,
  signal?: AbortSignal,
): Promise<OfficePreviewResult> {
  const response = await fetch(`${WORKER_URL}/office-preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_id: fileId }),
    signal,
  });

  if (response.status === 200) {
    const pdf = await response.blob();
    if (pdf.type && pdf.type !== 'application/pdf') {
      throw new Error('خدمة المعاينة أعادت نوع ملف غير متوقع.');
    }
    return { status: 'ready', pdf };
  }

  if (response.status === 202) {
    const body = await response.json() as { status?: string; retry_after_seconds?: number };
    return {
      status: body.status === 'processing' ? 'processing' : 'queued',
      retryAfterSeconds: Math.max(2, Math.min(Number(body.retry_after_seconds) || 2, 10)),
    };
  }

  if (response.status === 422) {
    const body = await response.json() as { status?: string; error_code?: string };
    if (body.status === 'failed') {
      return { status: 'failed', errorCode: body.error_code || 'conversion_failed' };
    }
  }

  throw await responseError(response);
}
