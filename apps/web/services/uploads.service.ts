import { apiClient } from "@/lib/api-client";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
    uploadUrl: string;
    fileUrl: string;
    key: string;
}

export async function uploadImage(file: File, folder: string, token: string): Promise<UploadResult> {
    const payload = {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        folder,
    };

    const response = await apiClient(`${API_URL}/uploads/presigned-url`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(token),
        },
        body: JSON.stringify(payload),
    }, token);

    const { uploadUrl, fileUrl, key } = await handleResponse<UploadResult>(response);

    const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
            "Content-Type": file.type || "application/octet-stream",
        },
    });

    if (!putResponse.ok) {
        throw new Error(`Failed to upload file to S3: ${putResponse.status}`);
    }

    return { uploadUrl, fileUrl, key };
}
