import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Dayjs } from "dayjs";
import {
    Autocomplete,
    Box,
    Button,
    FormControlLabel,
    Radio,
    RadioGroup,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { theme } from "@/styles/theme";
import { BCDesignTokens } from "epic.theme";
import HelpIcon from "@mui/icons-material/Help";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DocumentType, DocumentTypeModel } from "@/models/Document";
import { ProjectModel } from "@/models/Project";
import { DocumentTypes } from "@/utils/enums";
import { useCreateDocument, useGetDocumentsByProject, useUpdateDocumentDetails } from "@/hooks/api/useDocuments";
import { useCreateAmendment } from "@/hooks/api/useAmendments";
import { useManualEntryExtractionRequest } from "@/hooks/api/useExtractionRequests";
import { CreateAmendmentModel } from "@/models/Amendment";
import { CreateDocumentModel, DocumentModel } from "@/models/Document";
import { CustomTooltip } from "@/components/Shared/Common";
import { useNavigate } from "@tanstack/react-router";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { useQueryClient } from "@tanstack/react-query";
import LoadingButton from "@/components/Shared/Buttons/LoadingButton";

type DocumentEntryFormProps = {
    documentType: DocumentTypeModel[];
    projectArray: ProjectModel[];
    onCancel?: () => void;
    preselectedProject?: ProjectModel | null;
    restrictToCategoryId?: number | null;
    transferData?: {
        projectId?: string;
        documentTypeId?: number;
        documentLabel?: string;
        documentId?: string;
        dateIssued?: string;
        extractionRequestId?: number;
    };
};

export const DocumentEntryForm = ({
    documentType,
    projectArray,
    onCancel,
    preselectedProject = null,
    restrictToCategoryId = null,
    transferData,
}: DocumentEntryFormProps) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [formState, setFormState] = useState({
        selectedProject: preselectedProject as ProjectModel | null,
        selectedDocumentType: null as number | null,
        selectedDocumentId: null as string | null,
        selectedDocumentLabel: null as string | null,
        documentLabel: "",
        documentLink: "",
        dateIssued: null as Dayjs | null,
        isLatestAmendment: false,
    });

    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!transferData) return;
        const transferredProject = projectArray.find(
            (project) => project.project_id === transferData.projectId
        ) || preselectedProject;

        setFormState((prev) => ({
            ...prev,
            selectedProject: transferredProject || null,
            selectedDocumentType: transferData.documentTypeId || null,
            documentLabel: transferData.documentLabel || "",
            dateIssued: transferData.dateIssued ? dayjs(transferData.dateIssued) : null,
        }));
    }, [projectArray, preselectedProject, transferData]);

    const updateFormState = (updates: Partial<typeof formState>) => {
        setFormState((prev) => ({ ...prev, ...updates }));
    };

    const resetErrors = () => {
        setErrors({
            selectedProject: false,
            selectedDocumentType: false,
            documentLabel: false,
            dateIssued: false,
        });
    };

    const validateFields = () => {
        const newErrors = {
            selectedProject: !formState.selectedProject,
            selectedDocumentType: !formState.selectedDocumentType,
            documentLabel: !formState.documentLabel.trim(),
            dateIssued: !formState.dateIssued,
        };
        setErrors(newErrors);
        return !Object.values(newErrors).includes(true);
    };

    const resetForm = () => {
        setFormState({
            selectedProject: preselectedProject,
            selectedDocumentType: null,
            selectedDocumentId: null,
            selectedDocumentLabel: null,
            documentLabel: "",
            documentLink: "",
            dateIssued: null,
            isLatestAmendment: false,
        });
        resetErrors();
    };

    const filteredDocumentTypes = (documentType || []).filter((type) => {
        if (restrictToCategoryId !== null && !type.categories?.some(c => c.id === restrictToCategoryId)) return false;
        if (!formState.selectedProject || !formState.selectedProject.documents) return true;

        const hasCertificate = formState.selectedProject.documents.some((document) =>
            document.document_types?.includes(DocumentType.Certificate)
        );
        const hasExemptionOrder = formState.selectedProject.documents.some((document) =>
            document.document_types?.includes(DocumentType.ExemptionOrder)
        );

        if (type.document_type === DocumentType.Certificate) return !hasExemptionOrder;
        if (type.document_type === DocumentType.ExemptionOrder) return !hasCertificate;
        return true;
    });

    const {
        data: documentData,
        isPending: isDocumentsLoading,
    } = useGetDocumentsByProject(
        formState.selectedDocumentType === DocumentTypes.Amendment,
        formState.selectedProject?.project_id,
        undefined,
        DocumentTypes.Certificate.toString()
    );

    useEffect(() => {
        if (formState.selectedDocumentType !== DocumentTypes.Amendment || isDocumentsLoading) return;
        const docs = (documentData || []) as DocumentModel[];
        if (docs.length === 1) {
            updateFormState({
                selectedDocumentId: docs[0].document_record_id,
                selectedDocumentLabel: docs[0].document_label,
            });
        } else {
            updateFormState({ selectedDocumentId: null, selectedDocumentLabel: null });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentData, isDocumentsLoading, formState.selectedDocumentType]);

    const getDocumentName = (type: DocumentTypes | null): string => {
        switch (type) {
            case DocumentTypes.Certificate: return "Certificate";
            case DocumentTypes.ExemptionOrder: return "Exemption Order";
            default: return "";
        }
    };

    const { mutateAsync: createDocument } = useCreateDocument(
        formState.selectedProject?.project_id,
        {
            onSuccess: () => notify.success("Document created successfully"),
            onError: () => notify.error("Failed to create document"),
        }
    );

    const { mutateAsync: updateDocumentDetails } = useUpdateDocumentDetails(
        transferData?.documentId,
        {
            onSuccess: () => notify.success("Document created successfully"),
            onError: () => notify.error("Failed to create document"),
        }
    );

    const { mutateAsync: rejectExtractionRequest } = useManualEntryExtractionRequest();

    const { mutateAsync: createAmendment } = useCreateAmendment(
        formState.selectedDocumentId ? formState.selectedDocumentId : "",
        {
            onSuccess: () => notify.success("Document created successfully"),
            onError: () => notify.error("Failed to create document"),
        }
    );

    const handleSubmit = async () => {
        if (!validateFields()) return;

        setLoading(true);

        const formattedDateIssued = formState.dateIssued
            ? formState.dateIssued.toISOString().split("T")[0]
            : undefined;

        const isAmendment =
            formState.selectedDocumentType === DocumentTypes.Amendment &&
            formState.selectedDocumentId;

        // Manual entry replacing a failed extraction reuses the original document record.
        const isManualEntryUpdate = !isAmendment && !!transferData?.documentId;

        updateFormState({
            isLatestAmendment: formState.selectedDocumentType === DocumentTypes.OtherOrder,
        });

        const selectedType = filteredDocumentTypes.find(t => t.id === formState.selectedDocumentType);
        const resolvedCategoryId = restrictToCategoryId ?? selectedType?.categories?.[0]?.id ?? null;

        const payload = isAmendment
            ? {
                amendment_name: formState.documentLabel,
                amendment_link: formState.documentLink,
                date_issued: formattedDateIssued,
                is_latest_amendment_added: formState.isLatestAmendment,
            }
            : {
                document_label: formState.documentLabel,
                document_link: formState.documentLink,
                document_type_id: formState.selectedDocumentType,
                document_category_id: resolvedCategoryId,
                date_issued: formattedDateIssued,
                is_latest_amendment_added: formState.isLatestAmendment,
                is_active: true,
            };

        try {
            const response = isAmendment
                ? await createAmendment(payload as CreateAmendmentModel)
                : isManualEntryUpdate
                    ? await updateDocumentDetails(payload as CreateDocumentModel)
                    : await createDocument(payload as CreateDocumentModel);

            queryClient.invalidateQueries({ queryKey: ["projects"] });

            if (transferData?.extractionRequestId) {
                await rejectExtractionRequest(transferData.extractionRequestId);
            }

            if (response) {
                const navigateTo = isAmendment
                    ? `/conditions/project/${formState.selectedProject?.project_id}/document/${response.amended_document_id}`
                    : isManualEntryUpdate
                        ? `/conditions/project/${formState.selectedProject?.project_id}/document/${transferData?.documentId}`
                        : `/conditions/project/${response.project_id}/document/${response.document_id}`;

                navigate({ to: navigateTo });
            }
        } catch {
            notify.error("Failed to create document");
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        resetForm();
        onCancel?.();
    };

    return (
        <>
            <Box
                sx={{
                    backgroundColor: BCDesignTokens.surfaceColorBackgroundLightBlue,
                    padding: "16px 20px",
                }}
            >
                <Typography variant="h6" fontWeight={600} gutterBottom>
                    {transferData ? "Information Transferred from Extractor" : "Manual Document Entry"}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                    {transferData
                        ? "The document details have been populated from your previous entry. You can edit any field if needed."
                        : "Manually enter a document and its details into the system."}
                </Typography>
            </Box>
        <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            padding={"14px"}
        >
            <Stack direction={"column"} sx={{ width: "100%" }}>

                {/* Project Selector */}
                <Typography variant="body1" marginBottom={"2px"}>
                    Which project does this document belong to?
                </Typography>
                <Autocomplete
                    id="project-selector"
                    data-testid="project-selector"
                    options={projectArray || []}
                    value={formState.selectedProject}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label=" "
                            InputLabelProps={{ shrink: false }}
                            fullWidth
                            error={errors.selectedProject}
                            helperText={errors.selectedProject ? "Please select a project" : ""}
                            inputProps={{
                                ...params.inputProps,
                                "data-testid": "project-selector-input",
                            }}
                        />
                    )}
                    size="small"
                    getOptionLabel={(project: ProjectModel) => project.project_name}
                    onChange={(_e, project) => {
                        updateFormState({ selectedProject: project });
                        setErrors((prev) => ({ ...prev, selectedProject: false }));
                    }}
                />

                {/* Document Type Selector */}
                <Typography variant="body1">
                    What type of document are you adding?
                </Typography>
                <Autocomplete
                    id="document-type-selector"
                    options={filteredDocumentTypes || []}
                    value={
                        filteredDocumentTypes.find(
                            (type) => type.id === formState.selectedDocumentType
                        ) || null
                    }
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label=" "
                            InputLabelProps={{ shrink: false }}
                            fullWidth
                            error={errors.selectedDocumentType}
                            helperText={
                                errors.selectedDocumentType ? "Please select a document type" : ""
                            }
                        />
                    )}
                    size="small"
                    getOptionLabel={(type: DocumentTypeModel) => type.document_type}
                    onChange={(_e, type) => {
                        updateFormState({ selectedDocumentType: type?.id || null });
                        setErrors((prev) => ({ ...prev, selectedDocumentType: false }));
                    }}
                    disabled={!formState.selectedProject}
                />

                {/* Amended Document Selector — only shown when multiple documents exist */}
                {formState.selectedDocumentType === DocumentTypes.Amendment &&
                    !isDocumentsLoading &&
                    ((documentData || []) as DocumentModel[]).length > 1 && (
                        <>
                            <Typography variant="body1">Document being amended</Typography>
                            <Autocomplete
                                id="document-selector"
                                options={(documentData || []) as DocumentModel[]}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label=" "
                                        InputLabelProps={{ shrink: false }}
                                        fullWidth
                                    />
                                )}
                                size="small"
                                getOptionLabel={(document: DocumentModel) =>
                                    document.document_label
                                }
                                onChange={(
                                    _e: React.SyntheticEvent<Element, Event>,
                                    document: DocumentModel | null
                                ) => {
                                    updateFormState({
                                        selectedDocumentId: document?.document_record_id || null,
                                        selectedDocumentLabel: document?.document_label || null,
                                    });
                                }}
                                disabled={!formState.selectedProject}
                            />
                        </>
                    )}

                {formState.selectedDocumentType !== DocumentTypes.Amendment &&
                    formState.selectedDocumentType !== DocumentTypes.OtherOrder &&
                    formState.selectedDocumentType !== null && (
                        <>
                            <Typography variant="body1">
                                Does this {getDocumentName(formState.selectedDocumentType)}{" "}
                                document contain amendment(s)?
                            </Typography>
                            <RadioGroup
                                row
                                name="isLatestAmendment"
                                value={formState.isLatestAmendment?.toString()}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    updateFormState({
                                        isLatestAmendment: e.target.value === "true",
                                    })
                                }
                                sx={{ marginBottom: "20px" }}
                            >
                                <FormControlLabel
                                    value="false"
                                    control={<Radio />}
                                    label={`Yes, this ${getDocumentName(formState.selectedDocumentType)} document contains amendment(s)`}
                                />
                                <FormControlLabel
                                    value="true"
                                    control={<Radio />}
                                    label={`No, this ${getDocumentName(formState.selectedDocumentType)} document does not contain amendment(s)`}
                                />
                            </RadioGroup>
                        </>
                    )}

                {formState.selectedDocumentType === DocumentTypes.Amendment &&
                    formState.selectedDocumentId !== null && (
                        <>
                            <Typography variant="body1">
                                Is this the most recent Amendment to{" "}
                                {formState.selectedDocumentLabel}?
                            </Typography>
                            <RadioGroup
                                row
                                name="isLatestAmendment"
                                value={formState.isLatestAmendment?.toString()}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    updateFormState({
                                        isLatestAmendment: e.target.value === "true",
                                    })
                                }
                                sx={{ marginBottom: "20px" }}
                            >
                                <FormControlLabel
                                    value="true"
                                    control={<Radio />}
                                    label="Yes, this is the most recent Amendment"
                                />
                                <FormControlLabel
                                    value="false"
                                    control={<Radio />}
                                    label="No, this is not the most recent Amendment"
                                />
                            </RadioGroup>
                        </>
                    )}

                {/* Document Label */}
                <Stack direction={"row"} sx={{ width: "100%" }}>
                    <Typography variant="body1">Document label</Typography>
                    <CustomTooltip
                        disableInteractive
                        title={
                            <>
                                This is how the document will be titled in the condition
                                repository. <br />
                                Note: You do not need to use the official name of the document.
                            </>
                        }
                        placement="top"
                        arrow
                    >
                        <HelpIcon
                            fontSize="small"
                            sx={{
                                marginTop: "3px",
                                marginLeft: "5px",
                                color: theme.palette.primary?.main,
                            }}
                        />
                    </CustomTooltip>
                </Stack>
                <TextField
                    value={formState.documentLabel}
                    onChange={(e) => {
                        updateFormState({ documentLabel: e.target.value });
                        setErrors((prev) => ({ ...prev, documentLabel: false }));
                    }}
                    error={errors.documentLabel}
                    helperText={errors.documentLabel ? "Please enter a document label" : ""}
                    fullWidth
                    placeholder="Document label"
                    size="small"
                    disabled={
                        !formState.selectedProject ||
                        (formState.selectedDocumentType === DocumentTypes.Amendment &&
                            !formState.selectedDocumentId?.trim())
                    }
                />

                {/* Date Issued */}
                <Stack direction={"row"} sx={{ width: "100%" }}>
                    <Typography variant="body1">Date issued</Typography>
                    <CustomTooltip
                        disableInteractive
                        title={
                            <>
                                This is the year that the document was officially
                                signed/approved. <br />
                                Note: Please ensure you do not input the date that it was
                                published to EPIC.
                            </>
                        }
                        placement="top"
                        arrow
                    >
                        <HelpIcon
                            fontSize="small"
                            sx={{
                                marginTop: "3px",
                                marginLeft: "5px",
                                color: theme.palette.primary?.main,
                            }}
                        />
                    </CustomTooltip>
                </Stack>
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DatePicker
                        value={formState.dateIssued}
                        onChange={(newDate) => {
                            updateFormState({ dateIssued: newDate });
                            setErrors((prev) => ({ ...prev, dateIssued: false }));
                        }}
                        inputFormat="MM/DD/YYYY"
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                error={errors.dateIssued}
                                helperText={
                                    errors.dateIssued ? "Please enter a date issued" : ""
                                }
                                fullWidth
                                size="small"
                            />
                        )}
                        disabled={
                            !formState.selectedProject ||
                            (formState.selectedDocumentType === DocumentTypes.Amendment &&
                                !formState.selectedDocumentId?.trim())
                        }
                    />
                </LocalizationProvider>

                {/* Document Link */}
                <Stack direction={"row"} sx={{ width: "100%" }}>
                    <Typography variant="body1">Link to document</Typography>
                    <CustomTooltip
                        disableInteractive
                        title={"This is to include the URL to the document in EPIC."}
                        placement="top"
                        arrow
                    >
                        <HelpIcon
                            fontSize="small"
                            sx={{
                                marginTop: "3px",
                                marginLeft: "5px",
                                color: theme.palette.primary?.main,
                            }}
                        />
                    </CustomTooltip>
                </Stack>
                <TextField
                    value={formState.documentLink}
                    onChange={(e) => updateFormState({ documentLink: e.target.value })}
                    fullWidth
                    placeholder="Link to document"
                    size="small"
                    disabled={
                        !formState.selectedProject ||
                        (formState.selectedDocumentType === DocumentTypes.Amendment &&
                            !formState.selectedDocumentId?.trim())
                    }
                />

                {/* Actions */}
                <Box sx={{ display: "flex", justifyContent: "right", marginTop: "16px" }}>
                    <Button
                        variant="outlined"
                        sx={{ minWidth: "100px" }}
                        onClick={handleCancel}
                    >
                        Cancel
                    </Button>
                    <LoadingButton
                        variant="contained"
                        sx={{ marginLeft: "8px", minWidth: "100px" }}
                        onClick={handleSubmit}
                        loading={loading}
                    >
                        Add
                    </LoadingButton>
                </Box>
            </Stack>
        </Box>
        </>
    );
};
