import { ConditionModel } from "./Condition";

export interface DocumentModel {
  document_record_id: string;
  document_id: string;
  document_label: string;
  document_category_id: number;
  document_category: string;
  document_file_name: string;
  project_id: string;
  document_types: string[];
  date_issued: string;
  act: string;
  status: boolean;
  amendment_count: number;
  is_latest_amendment_added: boolean;
  conditions?: ConditionModel[];  // Multiple conditions per document
  type: string;
}

export type DocumentStatus = "true" | "false" | "nodata";
export const DOCUMENT_STATUS: Record<
  DocumentStatus,
  { value: DocumentStatus; label: string }
> = {
  true: {
    value: "true",
    label: "Confirmed",
  },
  false: {
    value: "false",
    label: "Pending",
  },
  nodata: {
    value: "nodata",
    label: "Data Entry Required",
  },
};

export interface AllDocumentModel {
  document_id: string;
  document_label: string;
  year_issued: number;
  status: boolean;
  is_latest_amendment_added?: boolean | null;
  parent_document_id?: string;
}

export interface ProjectDocumentAllAmendmentsModel {
  project_name: string;
  document_type: string;
  document_category: string;
  documents?: AllDocumentModel[];
}

export interface DocumentTypeModel {
  id: number;
  document_type: string;
  categories: DocumentCategoryModel[];
}

export interface CreateDocumentModel {
  document_label: string | null;
  document_link: string | null;
  document_type_id?: number | null;
  document_category_id?: number | null;
  date_issued?: string | null;
  is_latest_amendment_added?: boolean | null;
  is_active?: boolean;
}

export enum DocumentType {
  'ExemptionOrder' = 'Exemption Order',
  'Certificate' = 'Certificate',
}

export interface DocumentDetailsModel {
  project_name: string;
  document_category_id: string;
  document_category: string;
  document_id: string;
  document_label: string;
  document_type_id: number;
  year_issued: number | null;
}

export interface DocumentLabelModel {
  document_id: string;
  document_label: string;
  date_issued: string | null;
  act: number | null;
  project_type: string | null;
}

export interface DocumentCategoryModel {
  id: number;
  category_name: string;
}

export interface AvailableDocumentModel {
  document_id: string;
  document_label: string;
  date_issued: string | null;
  document_type: string | null;
}

export interface EaoSearchDocumentResult {
  _id: string;
  displayName: string;
  datePosted: string | null;
  documentType: string | null;
  legislation: number | null;
}

export interface EaoSearchResponse {
  searchResults: EaoSearchDocumentResult[];
  meta: Array<{ searchResultsTotal: number }>;
}
