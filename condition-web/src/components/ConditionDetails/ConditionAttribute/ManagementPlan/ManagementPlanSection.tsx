import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import ManagementPlanAccordion from "./ManagementPlanAccordion";
import { ConditionModel } from "@/models/Condition";
import { useRemoveManagementPlan } from "@/hooks/api/useManagementPlan";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { useUpdateConditionDetails } from "@/hooks/api/useConditions";
import { useGetReports } from "@/hooks/api/useReport";
import { ReportModel } from "@/models/ConditionAttribute";

type ManagementPlanSectionProps = {
  condition: ConditionModel;
  setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
};

const ManagementPlanSection = memo(
  ({ condition, setCondition }: ManagementPlanSectionProps) => {
    const queryClient = useQueryClient();
    const managementPlans =
      condition?.condition_attributes?.management_plans || [];

    const { data: reports = [] } = useGetReports(condition.condition_id);

    // Build a set of plan IDs that have at least one linked report submission
    const linkedPlanIds = new Set<string>(
      (reports as ReportModel[])
        .flatMap((r) => r.submissions ?? [])
        .filter((s) => s.linked_management_plan_id != null)
        .map((s) => String(s.linked_management_plan_id))
    );

    const { mutateAsync: removeManagementPlan } = useRemoveManagementPlan({
      onSuccess: () => notify.success("Management plan deleted"),
      onError: () => notify.error("Failed to delete management plan"),
    });

    const { mutate: updateConditionDetails } = useUpdateConditionDetails(
      false,
      false,
      condition.condition_id
    );

    const handleDeletePlan = async (planId: string) => {
      await removeManagementPlan(planId);
      // Invalidate reports cache — linked reports were cascade-deleted on the backend
      queryClient.removeQueries({ queryKey: ["reports", condition.condition_id] });
      setCondition((prev) => {
        const remainingPlans =
          prev.condition_attributes?.management_plans?.filter(
            (p) => p.id !== planId
          ) || [];
        const allApproved =
          remainingPlans.length > 0 && remainingPlans.every((p) => p.is_approved);
        if (prev.is_condition_attributes_approved !== allApproved) {
          updateConditionDetails({ is_condition_attributes_approved: allApproved });
        }
        return {
          ...prev,
          is_condition_attributes_approved: allApproved,
          condition_attributes: {
            ...prev.condition_attributes,
            management_plans: remainingPlans,
            independent_attributes:
              prev.condition_attributes?.independent_attributes || [],
          },
        };
      });
    };

    if (managementPlans.length === 0) return null;

    return (
      <Box>
        {/* Section header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mx: "28px",
            mt: "28px",
            px: 2,
            py: 1,
            backgroundColor: "#f1f8fe",
            borderRadius: "2px 2px 0 0",
          }}
        >
          <Typography fontSize="18px" color="#2d2d2d">
            Management Plans
          </Typography>
          <Box
            sx={{
              height: 22,
              borderRadius: "100px",
              backgroundColor: "#d8d8d8",
              color: "#474543",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              px: 1,
            }}
          >
            {managementPlans.length}
          </Box>
        </Box>

        {/* Accordions */}
        <Box sx={{ px: "28px", pt: 2 }}>
          {managementPlans.map((plan, index) => (
            <ManagementPlanAccordion
              key={plan.id}
              attributes={plan}
              title={plan.name || `Management Plan ${index + 1}`}
              condition={condition}
              setCondition={setCondition}
              onDelete={handleDeletePlan}
              hasLinkedReport={linkedPlanIds.has(String(plan.id))}
            />
          ))}
        </Box>
      </Box>
    );
  }
);

export default ManagementPlanSection;
