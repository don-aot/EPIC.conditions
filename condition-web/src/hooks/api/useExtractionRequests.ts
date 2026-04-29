import { submitRequest } from "@/utils/axiosUtils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ExtractedCondition {
    condition_number?: number | null;
    condition_name?: string | null;
    condition_text?: string | null;
    topic_tags?: string[] | null;
    clauses?: ExtractedSubcondition[] | null;
    subconditions?: ExtractedSubcondition[] | null;
}

export interface ExtractedSubcondition {
    clause_identifier?: string | null;
    clause_text?: string | null;
    subcondition_identifier?: string | null;
    subcondition_text?: string | null;
    clauses?: ExtractedSubcondition[] | null;
    subconditions?: ExtractedSubcondition[] | null;
}

export interface ExtractedData {
    conditions?: ExtractedCondition[];
    [key: string]: unknown;
}

export interface ExtractionRequest {
    id: number;
    project_id: string;
    document_id?: string | null;
    document_type_id?: number | null;
    document_label?: string | null;
    original_file_name?: string | null;
    s3_url: string;
    file_size_bytes?: number | null;
    status: string;
    error_message?: string | null;
    extracted_data?: ExtractedData | null;
    created_date: string;
    updated_date?: string | null;
    uploaded_by_name?: string | null;
    imported_by_name?: string | null;
}

export interface CreateExtractionRequestPayload {
    project_id: string;
    document_id?: string | null;
    document_type_id?: number | null;
    document_label?: string | null;
    original_file_name?: string | null;
    s3_url: string;
    file_size_bytes?: number | null;
}

const createExtractionRequest = (payload: CreateExtractionRequestPayload) => {
    return submitRequest({
        url: "/extraction-requests",
        method: "post",
        data: payload,
    });
};

export const useCreateExtractionRequest = () =>
    useMutation({
        mutationFn: (payload: CreateExtractionRequestPayload) => createExtractionRequest(payload),
    });

export const useGetExtractionRequests = (status?: string) =>
    useQuery<ExtractionRequest[]>({
        queryKey: ["extraction-requests", status],
        queryFn: () =>
            submitRequest({
                url: `/extraction-requests${status ? `?status=${status}` : ""}`,
                method: "get",
            }),
    });

export const useImportExtractionRequest = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) =>
            submitRequest({
                url: `/extraction-requests/${id}/import`,
                method: "post",
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["extraction-requests"] });
        },
    });
};

export const useRejectExtractionRequest = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) =>
            submitRequest({
                url: `/extraction-requests/${id}/reject`,
                method: "patch",
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["extraction-requests"] });
        },
    });
};
