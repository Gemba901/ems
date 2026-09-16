import { apiClient } from "@/lib/api-client";
const API_URL = "/api";

function authHeaders(token: string) {
    return { Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || `Request failed with status ${res.status}`);
    }
    return res.json();
}

export interface UploadResult {
    id: string;
    uploadHeaders: Record<string, string>;
    uploadUrl: string;
    fileUrl: string;
    key: string;
}

export async function uploadImage(file: File, folder: string, token: string): Promise<UploadResult> {
    const payload = {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        folder,
        size: file.size,
    };

    const response = await apiClient(`${API_URL}/uploads/presigned-url`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(token),
        },
        body: JSON.stringify(payload),
    }, token);

    const { id, uploadUrl, uploadHeaders, fileUrl, key } = await handleResponse<UploadResult>(response);

    const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: uploadHeaders,
    });

    if (!putResponse.ok) {
        throw new Error(`Failed to upload file to S3: ${putResponse.status}`);
    }

    const completed = await apiClient(`${API_URL}/uploads/${id}/complete`, { method: 'POST' }, token);
    await handleResponse(completed);
    return { id, uploadUrl, uploadHeaders, fileUrl, key };
}
