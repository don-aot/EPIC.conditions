import React, { useEffect, useState } from "react";
import { Button, IconButton, TableCell, TableRow, TableRowProps } from "@mui/material";
import { CustomTooltip } from '../../../Shared/Common';
import { styled } from "@mui/system";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { Save } from "@mui/icons-material";
import RemoveIcon from '@mui/icons-material/Remove';
import { BCDesignTokens } from "epic.theme";
import { IndependentAttributeModel } from "@/models/ConditionAttribute";
import DeleteConfirmationModal from "../ManagementPlan/DeleteConfirmationModal";
import {
  CONDITION_KEYS,
  SELECT_OPTIONS,
  consultationRequiredKeys,
  iemRequiredKeys,
  managementRequiredKeys
} from "../Constants";
import DynamicFieldRenderer from "../DynamicFieldRenderer";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";

const StyledTableRow = styled(TableRow)(() => ({}));

type StyledTableRowProps = TableRowProps & { error?: boolean };

interface CustomProps {
  error: boolean;
}

export const PackageTableRow = ({
  error,
  children,
  ...otherProps
}: StyledTableRowProps) => {
  const childrenWithProps = React.Children.map(children, (child) =>
    React.isValidElement<CustomProps>(child)
      ? React.cloneElement<CustomProps>(child, { error })
      : child
  );

  return <StyledTableRow {...otherProps}>{childrenWithProps}</StyledTableRow>;
};

export const ConditionAttributeHeadTableCell = styled(TableCell)(() => ({
  border: `1px solid ${BCDesignTokens.themeGray30}`,
  paddingLeft: "10px !important",
}));

type ConditionAttributeRowProps = {
  conditionAttributeItem: IndependentAttributeModel;
  onSave: (updatedAttribute: IndependentAttributeModel) => void;
  onDelete?: (attribute: IndependentAttributeModel) => void;
  is_approved?: boolean;
  onEditModeChange?: (isEditing: boolean) => void;
  isManagementRequired?: boolean;
  isConsultationRequired: boolean;
  isIEMRequired: boolean;
};

const ConditionAttributeRow: React.FC<ConditionAttributeRowProps> = ({
  conditionAttributeItem,
  onSave,
  onDelete,
  is_approved,
  onEditModeChange,
  isManagementRequired,
  isConsultationRequired,
  isIEMRequired
}) => {
  const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
  const { key: conditionKey, value: attributeValue } = conditionAttributeItem;
  const [isEditable, setIsEditable] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editableValue, setEditableValue] = useState(attributeValue ?? "");
  const [otherValue, setOtherValue] = useState("");

  useEffect(() => {
    onEditModeChange?.(isEditable);
  }, [isEditable, onEditModeChange]);

  const [chipInput, setChipInput] = useState("");

  const [chips, setChips] = useState<string[]>(
    conditionKey === CONDITION_KEYS.PARTIES_REQUIRED
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
  const [submissionMilestones, setSubmissionMilestones] = useState<string[]>(
    conditionKey === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_SUBMISSION
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
  const [milestones, setMilestones] = useState<string[]>(
    conditionKey === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_IMPLEMENTATION
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

  useEffect(() => {
    setEditableValue(conditionAttributeItem.value ?? "");
    if (conditionKey === CONDITION_KEYS.PARTIES_REQUIRED) {
      setChips(
        conditionAttributeItem.value
          ?.replace(/[{}]/g, "") // Remove curly braces
          .match(/"(?:\\.|[^"\\])*"|[^,]+/g) // Match quoted strings or standalone words
          ?.map((item) =>
            item
              .trim()
              .replace(/^"(.*)"$/, "$1") // Remove surrounding quotes
              .replace(/\\"/g, '"') // Fix escaped quotes
          ) || []
      );
    }

  }, [conditionAttributeItem, conditionKey]);

  const escapeValue = (value: string) => {
    // Escape internal quotes properly
    const escapedValue = value.replace(/"/g, '\\"'); 
  
    // Wrap in quotes only if it contains commas, spaces, or special characters
    return /[\s,"]/.test(value) ? `"${escapedValue}"` : escapedValue;
  };

  const handleSave = () => {
    setIsEditable(false);

    // Include any uncommitted text still in the chip input field
    const chipsToSave =
      conditionKey === CONDITION_KEYS.PARTIES_REQUIRED && chipInput.trim()
        ? [...chips, chipInput.trim()]
        : chips;

    if (conditionKey === CONDITION_KEYS.PARTIES_REQUIRED && chipInput.trim()) {
      setChips(chipsToSave);
      setChipInput("");
    }

    const updatedValue =
      conditionKey === CONDITION_KEYS.PARTIES_REQUIRED
        ? `{${chipsToSave
            .filter((chip) => chip !== null && chip !== "")
            .map((chip) => escapeValue(chip)) // Add escape to all values
            .join(",")}}`
        : conditionKey === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_SUBMISSION
        ? submissionMilestones.map((submissionMilestone) => `${submissionMilestone}`).join(",")
        : conditionKey === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_IMPLEMENTATION
        ? milestones.map((milestone) => `${milestone}`).join(",")
        : otherValue !== ""
        ? otherValue
        : editableValue;

    onSave({ ...conditionAttributeItem, value: updatedValue });

    if (conditionKey === CONDITION_KEYS.PARTIES_REQUIRED) {
      const parsedChips =
        updatedValue
          ?.replace(/[{}]/g, "") // Remove curly braces
          .match(/"(?:\\.|[^"\\])*"|[^,]+/g) // Match quoted strings or standalone words
          ?.map((item) =>
            item
              .trim()
              .replace(/^"(.*)"$/, "$1") // Remove surrounding quotes
              .replace(/\\"/g, '"') // Fix escaped quotes
          ) || []

      setChips(parsedChips);
    }

    setOtherValue("");
  };

  const renderEditableField = () => {
    const options = SELECT_OPTIONS[conditionKey];
    return (
      <DynamicFieldRenderer
        editMode={isEditable}
        attributeData={{
          key: conditionKey,
          value: editableValue,
          setValue: setEditableValue,
        }}
        chipsData={{ chips, setChips, chipInput, setChipInput }}
        submissionMilestonesData={{ submissionMilestones, setSubmissionMilestones }}
        milestonesData={{ milestones, setMilestones }}
        otherData={{ otherValue, setOtherValue }}
        options={options}
      />
    );
  };

  const renderAttribute = () => {

    if (conditionKey === CONDITION_KEYS.PARTIES_REQUIRED) {
      return (
        <ul style={{ margin: 0, paddingLeft: "16px" }}>
          {chips?.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    if (conditionKey === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_SUBMISSION) {
      return (
        <ul style={{ margin: 0, paddingLeft: "16px" }}>
          {submissionMilestones?.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    if (conditionKey === CONDITION_KEYS.MILESTONES_RELATED_TO_PLAN_IMPLEMENTATION) {
      return (
        <ul style={{ margin: 0, paddingLeft: "16px" }}>
          {milestones?.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    const options = SELECT_OPTIONS[conditionKey];
    if (options) {
      const selectedOption = options.find((option) => option.value === editableValue);
    
      return (
        <span
          style={{
            fontSize: "inherit",
            lineHeight: "inherit",
            width: "40%",
          }}
        >
          {selectedOption ? selectedOption.label : editableValue}
        </span>
      );
    }

    return attributeValue;
  };

  return (
    <>
      <DeleteConfirmationModal
        open={deleteModalOpen}
        title="Delete Attribute?"
        description={`This attribute will be removed from this submission requirement. It can be re-added under "Add Condition Attribute".<br/><br/>Are you sure you wish to proceed?`}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => {
          setDeleteModalOpen(false);
          onDelete?.(conditionAttributeItem);
        }}
      />
      <PackageTableRow>
        <ConditionAttributeHeadTableCell align="left">
          {conditionKey}
          {(!attributeValue || attributeValue === "{}") && (
            (isManagementRequired && managementRequiredKeys.includes(conditionKey)) ||
            (isConsultationRequired && consultationRequiredKeys.includes(conditionKey)) ||
            (isIEMRequired && iemRequiredKeys.includes(conditionKey))
          ) && (
            <CustomTooltip title="This attribute is required and cannot be empty" arrow>
              <span style={{ color: "red", fontSize: "16px", marginLeft: "4px" }}>*</span>
            </CustomTooltip>
          )}
        </ConditionAttributeHeadTableCell>
        <ConditionAttributeHeadTableCell align="left">
          {isEditable ? renderEditableField() : renderAttribute()}
        </ConditionAttributeHeadTableCell>
        <ConditionAttributeHeadTableCell
          align="left"
          sx={{
            "&:hover": is_approved
              ? {}
              : {
                  backgroundColor: BCDesignTokens.themeGray70,
                },
          }}
        >
          {is_approved ? (
            <IconButton size="small" disabled sx={{ cursor: "default" }}>
              <RemoveIcon />
            </IconButton>
          ) : canManage ? (
            isEditable ? (
              <Button
                variant="contained"
                color="secondary"
                size="small"
                sx={{
                  borderRadius: "4px",
                  color: BCDesignTokens.themeGray100,
                }}
                onClick={handleSave}
              >
                <Save fontSize="small" sx={{ mr: 0.4 }}/>
                Save
              </Button>
            ) : (
              <>
                <IconButton size="small" onClick={() => setIsEditable(true)}>
                  <EditIcon />
                </IconButton>
                <IconButton size="small" onClick={() => setDeleteModalOpen(true)}>
                  <DeleteIcon />
                </IconButton>
              </>
            )
          ) : null}
        </ConditionAttributeHeadTableCell>
      </PackageTableRow>
    </>
  );
};

export default ConditionAttributeRow;
