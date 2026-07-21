import React, { memo, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import ManagementPlanSection from "./ManagementPlan/ManagementPlanSection";
import { ConditionModel } from "@/models/Condition";
import { ManagementPlanModel } from "@/models/ConditionAttribute";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";
import { useUpdateConditionAttributeDetails } from "@/hooks/api/useConditionAttribute";
import { QUERY_KEY } from "@/hooks/api/constants";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import {
  createDefaultManagementPlan,
} from "./ManagementPlan/helpers";
import {
  managementRequiredKeys,
  managementOptionalDefaultKeys,
} from "./Constants";

export type SubmissionType = "management_plan" | "iem_terms_of_engagement" | "report";

const SUBMISSION_OPTIONS: { value: SubmissionType; label: string }[] = [
  { value: "management_plan", label: "Management Plan" },
  { value: "iem_terms_of_engagement", label: "IEM Terms of Engagement" },
  { value: "report", label: "Report" },
];

const labelFor = (value: SubmissionType) =>
  SUBMISSION_OPTIONS.find((o) => o.value === value)?.label ?? value;

type ConditionAttributeProps = {
  condition: ConditionModel;
  setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
};

const ConditionAttribute = memo(
  ({ condition, setCondition }: ConditionAttributeProps) => {
    const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
    const queryClient = useQueryClient();

    const [activeTypes, setActiveTypes] = useState<SubmissionType[]>(() => {
      const init: SubmissionType[] = [];
      if (condition.requires_management_plan) init.push("management_plan");
      return init;
    });

    const [showForm, setShowForm] = useState(false);
    const [pendingTypes, setPendingTypes] = useState<SubmissionType[]>([]);

    // When all management plans are deleted, drop the type so the empty state shows
    useEffect(() => {
      const planCount = condition.condition_attributes?.management_plans?.length ?? 0;
      if (planCount === 0) {
        setActiveTypes((prev) => prev.filter((t) => t !== "management_plan"));
      }
    }, [condition.condition_attributes?.management_plans]);

    const { mutateAsync: updateAttributes } = useUpdateConditionAttributeDetails(
      condition.condition_id
    );

    // Management Plan can always be re-added (each confirm creates one more plan).
    // IEM / Report are one-time sections — filter them once active.
    const availableToAdd = SUBMISSION_OPTIONS.filter((o) => {
      if (pendingTypes.includes(o.value)) return false;
      if (o.value === "management_plan") return true;
      return !activeTypes.includes(o.value);
    });

    const handleDropdownChange = (e: SelectChangeEvent<string>) => {
      const value = e.target.value as SubmissionType;
      if (value && !pendingTypes.includes(value)) {
        setPendingTypes((prev) => [...prev, value]);
      }
    };

    const handleRemovePending = (type: SubmissionType) => {
      setPendingTypes((prev) => prev.filter((t) => t !== type));
    };

    const handleCancel = () => {
      setShowForm(false);
      setPendingTypes([]);
    };

    const handleConfirm = async () => {
      const addingMP = pendingTypes.includes("management_plan");

      // Activate all confirmed types (deduplicate management_plan)
      setActiveTypes((prev) => {
        const next = [...prev];
        pendingTypes.forEach((t) => {
          if (!next.includes(t)) next.push(t);
        });
        return next;
      });

      setShowForm(false);
      setPendingTypes([]);

      if (addingMP) {
        const existingPlans =
          condition.condition_attributes?.management_plans ?? [];
        const newPlan: ManagementPlanModel = createDefaultManagementPlan(
          `${existingPlans.length + 1}-${Date.now()}`,
          managementRequiredKeys,
          managementOptionalDefaultKeys
        );
        const updatedPlans = [...existingPlans, newPlan];

        // Show plan immediately with temp ID — no waiting for the API
        setCondition((prev) => ({
          ...prev,
          condition_attributes: {
            independent_attributes:
              prev.condition_attributes?.independent_attributes ?? [],
            management_plans: updatedPlans,
          },
          subconditions: prev.subconditions,
        }));

        try {
          const response = await updateAttributes({
            requires_management_plan: true,
            condition_attribute: {
              independent_attributes:
                condition.condition_attributes?.independent_attributes ?? [],
              management_plans: updatedPlans,
            },
          });

          // Replace temp-ID plan with real data (real DB ids, saved attributes)
          const savedPlans = response?.management_plans ?? updatedPlans;
          setCondition((prev) => ({
            ...prev,
            condition_attributes: {
              independent_attributes:
                prev.condition_attributes?.independent_attributes ?? [],
              management_plans: savedPlans,
            },
            subconditions: prev.subconditions,
          }));

          queryClient.invalidateQueries({
            queryKey: ["conditions", condition.condition_id],
          });
          queryClient.invalidateQueries({
            queryKey: [QUERY_KEY.CONDITIONSDETAIL],
          });

          notify.success("Management Plan added successfully");
        } catch {
          // Revert the optimistic plan on failure
          setCondition((prev) => ({
            ...prev,
            condition_attributes: {
              independent_attributes:
                prev.condition_attributes?.independent_attributes ?? [],
              management_plans: existingPlans,
            },
            subconditions: prev.subconditions,
          }));
          notify.error("Failed to add management plan.");
        }
      }
    };

    const isApproved = condition.is_condition_attributes_approved ?? false;
    // Management Plan is always addable; show button as long as user can manage
    const canAddMore = canManage && !isApproved;

    const hasNoTypes = activeTypes.length === 0;

    const submissionTypeForm = (
      <>
        <Typography sx={{ fontSize: "14px", mb: 1, ml: "28px" }}>
          Submission Type
        </Typography>

        <Select
          value=""
          onChange={handleDropdownChange}
          displayEmpty
          sx={{
            ml: "28px",
            width: "508px",
            height: "40px",
            "& .MuiSelect-select": { fontStyle: "italic", color: "#9f9d9c" },
          }}
          renderValue={() => "Select type..."}
        >
          {availableToAdd.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
          {availableToAdd.length === 0 && (
            <MenuItem disabled>All types selected</MenuItem>
          )}
        </Select>

        {pendingTypes.length > 0 && (
          <Box display="flex" flexWrap="wrap" gap={1} mt={1.5}>
            {pendingTypes.map((type) => (
              <Chip
                key={type}
                label={labelFor(type)}
                onDelete={() => handleRemovePending(type)}
                sx={{
                  backgroundColor: "#e8f4fd",
                  border: "1px solid",
                  borderColor: "primary.main",
                  color: "primary.main",
                  borderRadius: "100px",
                  fontSize: "14px",
                  "& .MuiChip-deleteIcon": {
                    color: "primary.main",
                    fontSize: "16px",
                  },
                }}
              />
            ))}
          </Box>
        )}

        <Box display="flex" justifyContent="flex-end" gap={1.5} mt={3}>
          <Button variant="outlined" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={pendingTypes.length === 0}
          >
            Confirm
          </Button>
        </Box>
      </>
    );

    return (
      <Box>
        {/* ── Empty state card ── */}
        {hasNoTypes && (
          <Box sx={{ pt: "28px", pb: "48px", pl: "28px", pr: "48px" }}>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "18px",
                lineHeight: "27px",
                mb: 1,
                color: "#2d2d2d",
              }}
            >
              No Submission Requirements Found
            </Typography>
            <Typography sx={{ fontSize: "14px", color: "#6d7274", mb: 3 }}>
              The system did not extract any submission requirements from the
              document.
            </Typography>

            {canAddMore && (
              <Button
                variant="contained"
                onClick={() => setShowForm(true)}
                startIcon={<AddIcon />}
                sx={{ ml: "28px" }}
                data-testid="add-submission-type-btn"
              >
                Add Submission Type
              </Button>
            )}

            {showForm && (
              <>
                <Divider sx={{ mt: 3, mb: 3 }} />
                {submissionTypeForm}
              </>
            )}
          </Box>
        )}

        {/* ── Active sections ── */}
        {!hasNoTypes && (
          <Box>
            {activeTypes.includes("management_plan") && (
              <ManagementPlanSection
                condition={condition}
                setCondition={setCondition}
              />
            )}

            {activeTypes.includes("iem_terms_of_engagement") && (
              <Box
                sx={{
                  mb: 2,
                  p: 3,
                  border: "1px solid #d8d8d8",
                  borderRadius: "4px",
                }}
              >
                <Typography fontWeight={700}>IEM Terms of Engagement</Typography>
                <Typography variant="body2" color="text.secondary">
                  Coming soon
                </Typography>
              </Box>
            )}

            {activeTypes.includes("report") && (
              <Box
                sx={{
                  mb: 2,
                  p: 3,
                  border: "1px solid #d8d8d8",
                  borderRadius: "4px",
                }}
              >
                <Typography fontWeight={700}>Report</Typography>
                <Typography variant="body2" color="text.secondary">
                  Coming soon
                </Typography>
              </Box>
            )}

            {/* "+ Add Submission Type" sits below all active sections */}
            {canAddMore && !showForm && (
              <Button
                variant="contained"
                onClick={() => setShowForm(true)}
                startIcon={<AddIcon />}
                sx={{ mt: "28px", ml: "28px" }}
                data-testid="add-submission-type-btn"
              >
                Add Submission Type
              </Button>
            )}

            {/* Inline form when adding more types to existing sections */}
            {showForm && (
              <Box sx={{ mt: 2 }}>
                {submissionTypeForm}
              </Box>
            )}
          </Box>
        )}
      </Box>
    );
  }
);

export default ConditionAttribute;
