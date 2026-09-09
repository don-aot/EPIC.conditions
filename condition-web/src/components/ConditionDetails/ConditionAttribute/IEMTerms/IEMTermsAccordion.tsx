import React, { useState, useEffect } from "react";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  CircularProgress,
  Button,
  Grid,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Chip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditIcon from "@/components/Shared/Icons/EditIcon";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import { IndependentAttributeModel, IEMTermsModel } from "@/models/ConditionAttribute";
import { BCDesignTokens } from "epic.theme";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { CONDITION_KEYS } from "../../ConditionAttribute/Constants";
import { QUERY_KEY } from "@/hooks/api/constants";
import ConditionAttributeRow from "../../ConditionAttribute/Independent/ConditionAttributeRow";
import { ConditionModel } from "@/models/Condition";
import { usePatchIEMTerms } from "@/hooks/api/useIEMTerms";
import { useUpdateConditionAttributeDetails, useDeleteSingleConditionAttribute } from "@/hooks/api/useConditionAttribute";
import { useQueryClient } from "@tanstack/react-query";
import ErrorMessage from "../ErrorMessage";
import { ApproveButton } from "../ApproveButton";
import { validateRequiredAttributes } from "@/utils/attributeValidation";
import { useUpdateConditionDetails } from "@/hooks/api/useConditions";
import DeleteIcon from "@/components/Shared/Icons/DeleteIcon";
import AddIcon from '@mui/icons-material/Add';
import DeleteConfirmationModal from "../ManagementPlan/DeleteConfirmationModal";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";
import { useGetAttributes } from "@/hooks/api/useAttributeKey";
import AttributeModal from "../AttributeModal";
import DynamicFieldRenderer from "../DynamicFieldRenderer";
import { SELECT_OPTIONS } from "../Constants";

type Props = {
  attributes: IEMTermsModel;
  title: string;
  condition: ConditionModel;
  setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
  onDelete?: (termsId: string) => void;
};

const IEMTermsAccordion: React.FC<Props> = ({
  attributes,
  title,
  condition,
  setCondition,
  onDelete
}) => {
  const queryClient = useQueryClient();
  const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
  const [editMode, setEditMode] = useState(false);
  const [termsName, setTermsName] = useState(title);
  const [expanded, setExpanded] = useState(false);

  const [isAnyRowEditing, setIsAnyRowEditing] = useState(false);
  const [isEditingTermsName, setIsEditingTermsName] = useState(false);
  const [showEditingError, setShowEditingError] = useState(false);
  const [conditionAttributeError, setConditionAttributeError] = useState(false);
  const [isConsultationRequired, setIsConsultationRequired] = useState(false);
  const [attributeHasData, setAttributeHasData] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [termsNameError, setTermsNameError] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAttribute, setSelectedAttribute] = useState("");
  const [attributeValue, setAttributeValue] = useState("");
  const [otherValue, setOtherValue] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [chipInput, setChipInput] = useState("");
  const [submissionMilestones, setSubmissionMilestones] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<string[]>([]);

  const termsId = !String(attributes.id).includes("-") ? Number(attributes.id) : undefined;

  const {
    data: attributesData,
    isPending: isAttributesLoading,
    isError: isAttributesError,
    refetch: refetchAttributes,
  } = useGetAttributes(condition.condition_id, undefined, termsId);

  useEffect(() => {
    if (isAddModalOpen) {
      refetchAttributes();
    }
  }, [isAddModalOpen, refetchAttributes]);

  const handleAddConditionAttribute = () => {
    if (isAttributesLoading) {
      notify.info("Loading attributes, please wait...");
      return;
    }
    if (isAttributesError) {
      notify.error("Failed to load attributes");
      return;
    }
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setSelectedAttribute("");
    setAttributeValue("");
    setOtherValue("");
    setChips([]);
    setChipInput("");
    setMilestones([]);
    setSubmissionMilestones([]);
  };

  const handleAttributeSelection = () => {
    if (!selectedAttribute) {
      notify.error("Please select an attribute before proceeding");
      return;
    }

    const formatArray = (arr: string[]) =>
      `{${arr.filter((item) => item.trim() !== "").map((item) => `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

    const newAttrValue =
      selectedAttribute === CONDITION_KEYS.PARTIES_REQUIRED
        ? formatArray(chips)
        : selectedAttribute === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_SUBMISSION
        ? submissionMilestones.join(",")
        : selectedAttribute === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_IMPLEMENTATION
        ? milestones.join(",")
        : otherValue !== ""
        ? otherValue
        : attributeValue;

    const updatedTerms = (condition.condition_attributes?.iem_terms || []).map((terms) => {
      if (terms.id === attributes.id) {
        return {
          ...terms,
          attributes: [
            ...terms.attributes,
            {
              id: `temp-${selectedAttribute}-${Date.now()}`,
              key: selectedAttribute,
              value: newAttrValue,
            },
          ],
        };
      }
      return terms;
    });

    updateAttributes({
      requires_iem_terms: true,
      condition_attribute: {
        independent_attributes: condition.condition_attributes?.independent_attributes || [],
        management_plans: condition.condition_attributes?.management_plans || [],
        iem_terms: updatedTerms,
      },
    });

    handleCloseAddModal();
  };

  const renderAddEditableField = () => {
    const options = SELECT_OPTIONS[selectedAttribute];
    return (
      <DynamicFieldRenderer
        editMode={false}
        attributeData={{ key: selectedAttribute, value: attributeValue, setValue: setAttributeValue }}
        chipsData={{ chips, setChips, chipInput, setChipInput }}
        submissionMilestonesData={{ submissionMilestones, setSubmissionMilestones }}
        milestonesData={{ milestones, setMilestones }}
        otherData={{ otherValue, setOtherValue }}
        options={options}
      />
    );
  };

  const { mutateAsync: updateTermsName, isPending: isUpdating } = usePatchIEMTerms(
    attributes.id,
    {
      onSuccess: () => notify.success("IEM Terms name updated successfully"),
      onError: () => notify.error("Failed to update IEM Terms name"),
    }
  );

  const onApproveFailure = () => notify.error("Failed to approve condition attribute");
  const onApproveSuccess = () => notify.success("Condition attribute successfully approved");

  const { data: conditionDetails, mutate: updateConditionDetails } = useUpdateConditionDetails(
    false,
    false,
    condition.condition_id,
    {
      onSuccess: onApproveSuccess,
      onError: onApproveFailure,
    }
  );

  useEffect(() => {
    if (conditionDetails) {
      setCondition((prevCondition) => ({
        ...prevCondition,
        ...conditionDetails,
        subconditions: prevCondition.subconditions
      }));
    }
  }, [conditionDetails, setCondition]);

  useEffect(() => {
    if (!attributes?.attributes) {
      setAttributeHasData(false);
      return;
    }
    setAttributeHasData(attributes.attributes.some(attr => (attr.value ?? '').trim() !== ''));
  }, [attributes]);

  useEffect(() => {
    const attrs = attributes.attributes || [];
    setIsConsultationRequired(
      attrs.some(
        (attr: IndependentAttributeModel) =>
          attr.key === CONDITION_KEYS.REQUIRES_CONSULTATION && attr.value === "true"
      )
    );
  }, [attributes.attributes]);

  const { data: conditionAttributeDetails, mutateAsync: updateAttributes } =
    useUpdateConditionAttributeDetails(condition.condition_id, {
      onSuccess: () => {
        notify.success("Condition attributes saved successfully");
        queryClient.invalidateQueries({ queryKey: ["conditions", condition.condition_id] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CONDITIONSDETAIL] });
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEY.ATTRIBUTEKEYS, condition.condition_id, undefined, termsId],
        });
      },
      onError: () => notify.error("Failed to save condition attributes"),
    });

  const { mutateAsync: deleteSingleAttribute } = useDeleteSingleConditionAttribute(
    condition.condition_id,
    {
      onSuccess: () => {
        notify.success("Attribute deleted successfully");
        queryClient.invalidateQueries({ queryKey: ["conditions", condition.condition_id] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CONDITIONSDETAIL] });
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEY.ATTRIBUTEKEYS, condition.condition_id, undefined, termsId],
        });
      },
      onError: () => notify.error("Failed to delete attribute"),
    }
  );

  const handleDeleteAttribute = async (attributeToDelete: IndependentAttributeModel) => {
    await deleteSingleAttribute(Number(attributeToDelete.id));

    setCondition((prev) => ({
      ...prev,
      condition_attributes: {
        ...prev.condition_attributes,
        independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
        management_plans: prev.condition_attributes?.management_plans ?? [],
        iem_terms: (prev.condition_attributes?.iem_terms || []).map((terms) => {
          if (terms.id === attributes.id) {
            return {
              ...terms,
              attributes: terms.attributes.filter((attr) => attr.id !== attributeToDelete.id),
            };
          }
          return terms;
        }),
      },
    }));
  };

  const handleUpdateTerms = async (
    updates: Partial<{ name: string; is_approved: boolean }>,
    afterSuccess?: () => void
  ) => {
    try {
      await updateTermsName(updates);

      setCondition((prev) => {
        const updatedTerms = prev.condition_attributes?.iem_terms?.map((terms) =>
          terms.id === attributes.id ? { ...terms, ...updates } : terms
        ) || [];

        return {
          ...prev,
          condition_attributes: {
            ...prev.condition_attributes,
            independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
            management_plans: prev.condition_attributes?.management_plans ?? [],
            iem_terms: updatedTerms,
          },
          subconditions: prev.subconditions,
        };
      });

      afterSuccess?.();
    } catch {
      notify.error("Failed to update IEM Terms.");
    }
  };

  const handleSaveTermsName = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const trimmedName = termsName.trim();
    if (!trimmedName) {
      setTermsNameError(true);
      return;
    }
    setTermsNameError(false);
    setConditionAttributeError(false);
    handleUpdateTerms({ name: trimmedName }, () => setEditMode(false));
    setIsEditingTermsName(false);
  };

  useEffect(() => {
    if (conditionAttributeDetails?.iem_terms) {
      setCondition((prevCondition) => ({
        ...prevCondition,
        condition_attributes: {
          independent_attributes: prevCondition.condition_attributes?.independent_attributes ?? [],
          management_plans: prevCondition.condition_attributes?.management_plans ?? [],
          iem_terms: conditionAttributeDetails.iem_terms,
        },
      }));

      const allTermsAttributes = conditionAttributeDetails.iem_terms.flatMap(
        (terms: IEMTermsModel) => terms.attributes || []
      );

      setIsConsultationRequired(
        allTermsAttributes.some(
          (attr: IndependentAttributeModel) =>
            attr.key === CONDITION_KEYS.REQUIRES_CONSULTATION && attr.value === "true"
        )
      );
    }
  }, [conditionAttributeDetails, setCondition]);

  const handleApproveTerms = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isAnyRowEditing || isEditingTermsName) {
      setShowEditingError(true);
      return;
    }
    setShowEditingError(false);

    const allAttributes = attributes.attributes || [];
    const isValid = validateRequiredAttributes({
      attributes: allAttributes,
      isConsultationRequired,
      isIEMRequired: true,
      isManagementRequired: false,
    });

    if (!isValid) {
      setConditionAttributeError(true);
      return;
    }
    setConditionAttributeError(false);

    const currentApproval = attributes.is_approved;
    await handleUpdateTerms(
      { is_approved: !currentApproval },
      () => {
        const updatedTerms = condition.condition_attributes?.iem_terms || [];
        if (updatedTerms.length === 0) return;

        const allApproved = updatedTerms.every((terms) =>
          terms.id === attributes.id ? !currentApproval : terms.is_approved
        );

        if (condition.is_condition_attributes_approved !== allApproved) {
          updateConditionDetails({ is_condition_attributes_approved: allApproved });
        }
      }
    );
  };

  const handleSave = async (updatedAttribute: IndependentAttributeModel) => {
    const updatedTerms = (condition.condition_attributes?.iem_terms || []).map((terms) => {
      if (terms.id === attributes.id) {
        return {
          ...terms,
          attributes: terms.attributes.map((attr) =>
            attr.id === updatedAttribute.id ? updatedAttribute : attr
          ),
        };
      }
      return terms;
    });

    const updatedConditionAttributes = {
      independent_attributes: condition.condition_attributes?.independent_attributes || [],
      management_plans: condition.condition_attributes?.management_plans || [],
      iem_terms: updatedTerms,
    };

    setCondition((prev) => ({
      ...prev,
      condition_attributes: updatedConditionAttributes,
    }));

    await updateAttributes({
      requires_iem_terms: true,
      condition_attribute: updatedConditionAttributes,
    });
  };

  return (
    <Grid
      container
      sx={{
        border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
        borderRadius: 1,
        marginBottom: "20px",
      }}
    >
      <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          sx={{ flexDirection: "row-reverse", justifyContent: "start", gap: 1 }}
        >
          <Box display="flex" flexDirection="row" alignItems="center" width="100%">
            <Box display="flex" flexDirection="column" width="76%">
              <Typography>IEM Terms of Engagement</Typography>

              {editMode && expanded ? (
                <Box>
                  <Box display="flex" flexDirection="row" alignItems="stretch" gap={1}>
                    <TextField
                      variant="outlined"
                      fullWidth
                      value={termsName}
                      onChange={(e) => setTermsName(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: "4px",
                          height: "40px",
                        },
                      }}
                    />
                    {isUpdating ? (
                      <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                    ) : (
                      <Button
                        variant="contained"
                        size="medium"
                        onClick={handleSaveTermsName}
                        sx={{
                          minWidth: "100px",
                          borderRadius: "4px",
                          backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
                          color: "black",
                          '&:hover': {
                            backgroundColor: BCDesignTokens.surfaceColorBorderDefault,
                          },
                          height: "40px",
                          padding: "0 12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <SaveAltIcon sx={{ color: "#255A90", mr: 1 }} fontSize="small" />
                        <Box sx={{ color: "#255A90", fontWeight: "bold" }}>Save</Box>
                      </Button>
                    )}
                  </Box>
                  {termsNameError && (
                    <Box sx={{ display: "flex", flexDirection: "row", marginTop: "-15px", color: "#CE3E39", fontSize: "14px" }}>
                      Please enter a name for IEM Terms of Engagement.
                    </Box>
                  )}
                </Box>
              ) : (
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography fontWeight="bold">{termsName}</Typography>
                  {canManage && expanded && !attributes.is_approved && (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setEditMode(true);
                        setIsEditingTermsName(true);
                      }}
                      sx={{
                        height: "28px",
                        backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
                        color: "black",
                        '&:hover': {
                          backgroundColor: BCDesignTokens.surfaceColorBorderDefault,
                        },
                      }}
                    >
                      <EditIcon size={20} color="#255A90" />
                      <Box sx={{ color: "#255A90", fontWeight: "bold" }}>Edit</Box>
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          </Box>

          <Box display="flex" flexDirection="column" width="20%" marginTop="12px" alignItems="flex-end">
            <Chip
              label={
                !attributeHasData
                  ? "Data Entry Required"
                  : attributes.is_approved
                  ? "Confirmed"
                  : "Awaiting Confirmation"
              }
              sx={{
                height: "24px",
                padding: "2px 8px",
                alignItems: "center",
                gap: "8px",
                justifyContent: "center",
                "& .MuiChip-label": { px: 0 },
                background: !attributeHasData
                  ? "var(--support-surfaceColor-danger, #F4E1E2)"
                  : attributes.is_approved
                  ? "var(--support-surfaceColor-success, #F6FFF8)"
                  : "var(--support-surfaceColor-warning, #FEF1D8)",
                border: !attributeHasData
                  ? "1px solid var(--support-borderColor-danger, #CE3E39)"
                  : attributes.is_approved
                  ? "1px solid var(--support-borderColor-success, #42814A)"
                  : "1px solid var(--support-borderColor-warning, #F8BB47)",
                color: "#2D2D2D",
                fontFamily: '"BC Sans"',
                fontWeight: 400,
                fontSize: "12px",
                lineHeight: "18px",
                borderRadius: "2px",
              }}
            />
          </Box>
          <Box display="flex" flexDirection="column" width="4%" marginTop="8px" alignItems="flex-end">
            {canManage && (
              <Tooltip title="Delete IEM Terms of Engagement">
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeleteModalOpen(true);
                  }}
                  size="small"
                >
                  <DeleteIcon size={20} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </AccordionSummary>

        <AccordionDetails>
          <TableContainer component={Box} sx={{ borderRadius: "4px", overflow: "auto" }}>
            <Table sx={{ tableLayout: "fixed" }}>
              <TableHead
                sx={{
                  ".MuiTableCell-root": {
                    p: BCDesignTokens.layoutPaddingXsmall,
                    backgroundColor: BCDesignTokens.themeGray30,
                    fontSize: "14px",
                    fontWeight: "bold",
                  },
                  borderBottom: "5px solid white",
                }}
              >
                <TableRow>
                  <TableCell align="left" sx={{ width: "30%" }}>Condition</TableCell>
                  <TableCell align="left" sx={{ width: "60%" }}>Attribute</TableCell>
                  <TableCell align="left" sx={{ width: "10%" }}>Actions</TableCell>
                </TableRow>
              </TableHead>

              <TableBody
                sx={{
                  ".MuiTableCell-root": {
                    p: BCDesignTokens.layoutPaddingXsmall,
                    backgroundColor: BCDesignTokens.themeGray10,
                    fontSize: "14px",
                  },
                }}
              >
                {attributes.attributes?.map((attr: IndependentAttributeModel) => (
                  <ConditionAttributeRow
                    key={attr.id}
                    conditionAttributeItem={attr}
                    onSave={handleSave}
                    onDelete={handleDeleteAttribute}
                    is_approved={attributes.is_approved}
                    onEditModeChange={(isEditing) => setIsAnyRowEditing(isEditing)}
                    isManagementRequired={false}
                    isConsultationRequired={isConsultationRequired}
                    isIEMRequired={true}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <ErrorMessage
            visible={conditionAttributeError}
            message="Please complete all the required attribute fields before confirming the IEM ToE Attributes."
          />

          <Stack sx={{ mt: 2 }} direction={"row"} justifyContent="space-between" alignItems="flex-end">
            <Box>
              {canManage && !attributes.is_approved && attributesData && attributesData.length > 0 && (
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  sx={{ padding: "4px 8px", borderRadius: "4px", color: BCDesignTokens.themeGray100 }}
                  onClick={handleAddConditionAttribute}
                >
                  <AddIcon fontSize="small" /> Add Condition Attribute
                </Button>
              )}
            </Box>

            {canManage && origin !== 'create' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <ApproveButton
                  isApproved={attributes.is_approved}
                  isAnyRowEditing={isAnyRowEditing}
                  showEditingError={showEditingError}
                  isEditingPlanName={isEditingTermsName}
                  onApprove={handleApproveTerms}
                  label={
                    attributes.is_approved
                      ? "Un-confirm IEM ToE Attributes"
                      : "Confirm IEM ToE Attributes"
                  }
                />
              </Box>
            )}
          </Stack>

          {!isAttributesLoading && (
            <AttributeModal
              open={isAddModalOpen}
              onClose={handleCloseAddModal}
              attributes={attributesData || []}
              selectedAttribute={selectedAttribute}
              onSelectAttribute={setSelectedAttribute}
              isLoading={isAttributesLoading}
              renderEditableField={renderAddEditableField}
              confirmDisabled={
                !attributeValue &&
                chips.length === 0 &&
                milestones.length === 0 &&
                submissionMilestones.length === 0 &&
                otherValue === ""
              }
              onConfirm={handleAttributeSelection}
            />
          )}
        </AccordionDetails>
      </Accordion>

      <DeleteConfirmationModal
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={() => {
          onDelete?.(attributes.id);
          setIsDeleteModalOpen(false);
        }}
      />
    </Grid>
  );
};

export default IEMTermsAccordion;
