import React, { memo, useEffect, useState } from "react";
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Stack
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import { BCDesignTokens } from "epic.theme";
import { theme } from "@/styles/theme";
import { useUpdateConditionAttributeDetails, useDeleteSingleConditionAttribute } from "@/hooks/api/useConditionAttribute";
import { ConditionModel } from "@/models/Condition";
import { IndependentAttributeModel } from "@/models/ConditionAttribute";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { useUpdateConditionDetails } from "@/hooks/api/useConditions";
import { updateTopicTagsModel } from "@/models/Condition";
import ConditionAttributeRow from "./ConditionAttributeRow";
import { useQueryClient } from "@tanstack/react-query";
import {  CONDITION_KEYS, SELECT_OPTIONS } from "../Constants";
import { QUERY_KEY } from "@/hooks/api/constants";
import DynamicFieldRenderer from "../DynamicFieldRenderer";
import AttributeModal from "../AttributeModal";
import { useGetAttributes } from "@/hooks/api/useAttributeKey";
import ErrorMessage from "../ErrorMessage";
import { ApproveButton } from "../ApproveButton";
import { validateRequiredAttributes } from "@/utils/attributeValidation";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";

type ConditionAttributeTableProps = {
    condition: ConditionModel;
    setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
    origin?: string;
};

const ConditionAttributeTable = memo(({
    condition,
    setCondition,
    origin
  }: ConditionAttributeTableProps) => {
    const queryClient = useQueryClient();
    const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
    const [conditionAttributeError, setConditionAttributeError] = useState(false);
    const [isAnyRowEditing, setIsAnyRowEditing] = useState(false);
    const [showEditingError, setShowEditingError] = useState(false);

    /* State variables to track the requirement status of mandatory attributes.
      These flags determine if management, consultation, or IEM attributes are still required. */
    const [isConsultationRequired, setIsConsultationRequired] = useState(false);
    const [isIEMRequired, setIsIEMRequired] = useState(false);

    const onCreateFailure = () => {
      notify.error("Failed to save condition attributes");
    };
    
    const onCreateSuccess = () => {
      notify.success("Condition attributes saved successfully");

      queryClient.invalidateQueries({
        queryKey: ["conditions", condition.condition_id],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEY.CONDITIONSDETAIL],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEY.ATTRIBUTEKEYS, condition.condition_id],
      });
    };
  
    const { data: conditionAttributeDetails, mutateAsync: updateAttributes } = useUpdateConditionAttributeDetails(
      condition.condition_id,
      {
        onSuccess: onCreateSuccess,
        onError: onCreateFailure,
      }
    );

    const { mutateAsync: deleteSingleAttribute } = useDeleteSingleConditionAttribute(
      condition.condition_id,
      {
        onSuccess: () => {
          notify.success("Attribute deleted successfully");
          queryClient.invalidateQueries({ queryKey: ["conditions", condition.condition_id] });
          queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CONDITIONSDETAIL] });
          queryClient.invalidateQueries({ queryKey: [QUERY_KEY.ATTRIBUTEKEYS, condition.condition_id] });
        },
        onError: () => notify.error("Failed to delete attribute"),
      }
    );
  
    const onApproveFailure = () => {
        notify.error("Failed to approve condition attribute");
    };
  
    const onApproveSuccess = () => {
        notify.success("Condition attribute successfully approved");
    };
  
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
      if (conditionAttributeDetails?.independent_attributes) {
        setCondition((prevCondition) => ({
          ...prevCondition,
          condition_attributes: {
            independent_attributes: conditionAttributeDetails.independent_attributes,
            management_plans: prevCondition.condition_attributes?.management_plans ?? [],
          },
        }));
      }

      if (conditionAttributeDetails?.independent_attributes) {
      /* Check if requires consultation is true */
      const consultationRequired = conditionAttributeDetails?.independent_attributes.some((
        attr: IndependentAttributeModel) => 
        attr.key === CONDITION_KEYS.REQUIRES_CONSULTATION && 
        (attr.value === "true")
      );
      setIsConsultationRequired(!!consultationRequired);
      /* Check if requires IEM terms of engagement is true */
      const IEMRequired = conditionAttributeDetails?.independent_attributes.some((
        attr: IndependentAttributeModel) => 
        attr.key === CONDITION_KEYS.REQUIRES_IEM_TERMS_OF_ENGAGEMENT && 
        (attr.value === "true")
      );
      setIsIEMRequired(!!IEMRequired);
    }

    }, [conditionAttributeDetails?.independent_attributes, setCondition, setIsConsultationRequired, setIsIEMRequired]);

    useEffect(() => {
      const attrs = condition.condition_attributes?.independent_attributes || [];
      setIsConsultationRequired(
        attrs.some((attr: IndependentAttributeModel) =>
          attr.key === CONDITION_KEYS.REQUIRES_CONSULTATION && attr.value === "true"
        )
      );
      setIsIEMRequired(
        attrs.some((attr: IndependentAttributeModel) =>
          attr.key === CONDITION_KEYS.REQUIRES_IEM_TERMS_OF_ENGAGEMENT && attr.value === "true"
        )
      );
    }, [condition.condition_attributes?.independent_attributes]);

    const approveConditionAttributes = () => {
      if (isAnyRowEditing) {
        setShowEditingError(true);
        return;
      }

      setShowEditingError(false);

      /* Validation logic to check if all mandatory attributes are filled in.
        - `getAttrValue` retrieves the value of an attribute based on the key.
        - `isEmpty` checks if a value is either null or an empty object (`{}`).
        - The `managementInvalid`, `consultationInvalid`, and `iemInvalid` variables are
          used to check whether the mandatory attributes for management, consultation,
          and IEM are filled in based on the respective required keys.
        - `hasInvalidAttributes` combines these checks to determine if any mandatory attributes
          are missing or invalid. */
      const allAttributes = condition?.condition_attributes?.independent_attributes || [];
      const isValid = validateRequiredAttributes({
        attributes: allAttributes,
        isManagementRequired: false,
        isConsultationRequired,
        isIEMRequired,
      });
      
      if (!isValid) {
        setConditionAttributeError(true);
        return;
      }

      const data: updateTopicTagsModel = {
        is_condition_attributes_approved: !condition.is_condition_attributes_approved }
      updateConditionDetails(data);
    };

    const handleDelete = async (attributeToDelete: IndependentAttributeModel) => {
      await deleteSingleAttribute(Number(attributeToDelete.id));

      setCondition((prevCondition) => ({
        ...prevCondition,
        condition_attributes: {
          independent_attributes: (prevCondition.condition_attributes?.independent_attributes || []).filter(
            (attr: IndependentAttributeModel) => attr.id !== attributeToDelete.id
          ),
          management_plans: prevCondition.condition_attributes?.management_plans || [],
        },
      }));
    };

    const handleSave = async (updatedAttribute: IndependentAttributeModel) => {
      setConditionAttributeError(false);
      const updatedIndependentAttributes = (condition.condition_attributes?.independent_attributes || []).map(
        (attr: IndependentAttributeModel) =>
          attr.id === updatedAttribute.id ? updatedAttribute : attr
      );
    
      const updatedConditionAttributes = {
        independent_attributes: updatedIndependentAttributes,
        management_plans: condition.condition_attributes?.management_plans || [],
      };
    
      setCondition((prevCondition) => ({
        ...prevCondition,
        condition_attributes: updatedConditionAttributes,
        ...conditionDetails,
      }));

      await updateAttributes({
        requires_management_plan: false,
        condition_attribute: updatedConditionAttributes,
      });
    };
  
    const handleAddConditionAttribute = () => {
      if (isAttributesLoading) {
        notify.info("Loading attributes, please wait...");
        return;
      }
  
      if (isAttributesError) {
        notify.error("Failed to load attributes");
        return;
      }
  
      setModalOpen(true);
    };

    const {
      data: attributesData,
      isPending: isAttributesLoading,
      isError: isAttributesError,
      refetch: refetchAttributes,
    } = useGetAttributes(condition.condition_id);

    const [isModalOpen, setModalOpen] = useState(false);
    const [selectedAttribute, setSelectedAttribute] = useState("");
    const [attributeValue, setAttributeValue] = useState("");
    const [otherValue, setOtherValue] = useState("");
    const [chips, setChips] = useState<string[]>(
      selectedAttribute === CONDITION_KEYS.PARTIES_REQUIRED
        ? attributeValue
            ?.replace(/[{}]/g, "") // Remove curly braces
            .match(/"(?:\\.|[^"\\])*"|[^,]+/g) // Match quoted strings or standalone words
            ?.map((item) =>
              item
                .trim()
                .replace(/^"(.*)"$/, "$1") // Remove surrounding quotes
                .replace(/\\"/g, '"') // Fix escaped quotes
            ) || []
        : []
    );
    const [submissionMilestones, setSubmissionMilestones] = useState<string[]>([]);
    const [milestones, setMilestones] = useState<string[]>([]);

    const handleCloseModal = () => {
      setModalOpen(false);
      setSelectedAttribute("");
      setAttributeValue("");
      setOtherValue("");
      setMilestones([]);
      setSubmissionMilestones([]);
      setChips([]);

      queryClient.invalidateQueries({
        queryKey: ["conditions", condition.condition_id],
      });
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEY.CONDITIONSDETAIL],
      });
    };

    const handleAttributeSelection = () => {
      if (!selectedAttribute) {
        notify.error("Please select an attribute before proceeding");
        return;
      }

      const formatArray = (arr: string[]) =>
        `{${arr.filter((item) => item.trim() !== "").map((item) => `"${item.replace(/"/g, '\\"')}"`).join(",")}}`;

      updateAttributes({
        requires_management_plan: false,
        condition_attribute: {
          independent_attributes: [
            {
              id: `(condition.condition_attributes?.length || 0) + 1-${Date.now()}`,
              key: selectedAttribute,
              value:
                selectedAttribute === CONDITION_KEYS.PARTIES_REQUIRED
                  ? formatArray(chips)
                  : selectedAttribute === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_SUBMISSION
                  ? submissionMilestones.map((submissionMilestone) => `${submissionMilestone}`).join(",")
                  : selectedAttribute === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_IMPLEMENTATION
                  ? milestones.map((milestone) => `${milestone}`).join(",")
                  : otherValue !== ""
                  ? otherValue
                  : attributeValue,
            },
          ],
          management_plans: [],
        },
      });

      // Close the modal and reset the selection
      setModalOpen(false);
      setSelectedAttribute("");
      setAttributeValue("");
      setChips([]);
      setOtherValue("");
    };

    const renderEditableField = () => {
      const options = SELECT_OPTIONS[selectedAttribute];
      return (
        <DynamicFieldRenderer
          editMode={false}
          attributeData={{
            key: selectedAttribute,
            value: attributeValue,
            setValue: setAttributeValue,
          }}
          chipsData={{ chips, setChips }}
          submissionMilestonesData={{ submissionMilestones, setSubmissionMilestones }}
          milestonesData={{ milestones, setMilestones }}
          otherData={{ otherValue, setOtherValue }}
          options={options}
        />
      );
    };

    useEffect(() => {
      if (isModalOpen) {
        refetchAttributes();
      }
    }, [isModalOpen, refetchAttributes]);

    return (
      <Box>
        <TableContainer component={Box} sx={{ height: "100%", overflow: "auto", borderRadius: "4px" }}>
          <Table sx={{ tableLayout: "fixed" }}>
            <TableHead
              sx={{
                ".MuiTableCell-root": {
                  p: BCDesignTokens.layoutPaddingXsmall,
                  backgroundColor: BCDesignTokens.themeGray30,
                  fontSize: '14px',
                  fontWeight: "bold",
                },
                borderBottom: `5px solid white`,
              }}
            >
              <TableRow>
                <TableCell align="left" sx={{ width: "30%", paddingLeft: "10px !important" }}>Condition</TableCell>
                <TableCell align="left" sx={{ width: "60%", paddingLeft: "10px !important" }}>Attribute</TableCell>
                <TableCell align="left" sx={{ width: "10%", paddingLeft: "10px !important" }}>Actions</TableCell>
              </TableRow>
            </TableHead>

            <TableBody
              sx={{
                ".MuiTableCell-root": {
                  p: BCDesignTokens.layoutPaddingXsmall,
                  backgroundColor: condition.is_condition_attributes_approved ? '#F7F9FC' : BCDesignTokens.themeGray10,
                  fontSize: '14px',
                },
              }}
            >
              {(condition.condition_attributes?.independent_attributes || []).map(
                (attribute: IndependentAttributeModel) => (
                <ConditionAttributeRow
                  key={attribute.id}
                  conditionAttributeItem={attribute}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  is_approved={condition.is_condition_attributes_approved}
                  onEditModeChange={(isEditing) => {
                    setIsAnyRowEditing(isEditing);
                  }}
                  isConsultationRequired={isConsultationRequired}
                  isIEMRequired={isIEMRequired}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ marginTop: 1, marginBottom: 2 }}>
          <ErrorMessage
            visible={conditionAttributeError}
            message="Please complete all the required attribute fields before confirming the Condition Attributes."
          />
        </Box>

        <Stack sx={{ mt: 5 }} direction={"row"}>
          <Box width="50%" sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            {canManage && !condition.is_condition_attributes_approved
             && attributesData && attributesData?.length > 0 && (
              <Button
                variant="contained"
                color="secondary"
                size="small"
                sx={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  color: BCDesignTokens.themeGray100,
                  border: `2px solid ${theme.palette.grey[700]}`,
                }}
                onClick={handleAddConditionAttribute}
              >
                <AddIcon fontSize="small" /> Add Condition Attribute
              </Button>
            )}
          </Box>
          {!isAttributesLoading &&
            <AttributeModal
                open={isModalOpen}
                onClose={handleCloseModal}
                attributes={attributesData || []}
                selectedAttribute={selectedAttribute}
                onSelectAttribute={setSelectedAttribute}
                isLoading={isAttributesLoading}
                renderEditableField={renderEditableField}
                confirmDisabled={
                  !attributeValue &&
                  chips.length === 0 &&
                  milestones.length === 0 &&
                  submissionMilestones.length == 0
                }
                onConfirm={handleAttributeSelection}
            />
          }

          {canManage && origin !== 'create' && (
            <Box width="50%" sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ApproveButton
                isApproved={condition.is_condition_attributes_approved || false}
                isAnyRowEditing={isAnyRowEditing}
                showEditingError={showEditingError}
                onApprove={approveConditionAttributes}
              />
            </Box>
          )}
        </Stack>
      </Box>
    );
});

export default ConditionAttributeTable;
