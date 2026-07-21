import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import ManagementPlanAccordion from "./ManagementPlanAccordion";
import { ConditionModel } from "@/models/Condition";
import { useRemoveManagementPlan } from "@/hooks/api/useManagementPlan";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";

type ManagementPlanSectionProps = {
  condition: ConditionModel;
  setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
};

const ManagementPlanSection = memo(
  ({ condition, setCondition }: ManagementPlanSectionProps) => {
    const managementPlans =
      condition?.condition_attributes?.management_plans || [];

    const { mutateAsync: removeManagementPlan } = useRemoveManagementPlan({
      onSuccess: () => notify.success("Management plan deleted"),
      onError: () => notify.error("Failed to delete management plan"),
    });

    const handleDeletePlan = async (planId: string) => {
      await removeManagementPlan(planId);
      setCondition((prev) => ({
        ...prev,
        condition_attributes: {
          ...prev.condition_attributes,
          management_plans:
            prev.condition_attributes?.management_plans?.filter(
              (p) => p.id !== planId
            ) || [],
          independent_attributes:
            prev.condition_attributes?.independent_attributes || [],
        },
      }));
    };

    if (managementPlans.length === 0) return null;

    return (
      <Box sx={{ mb: 2 }}>
        {/* Section header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            ml: "28px",
            py: 1,
            backgroundColor: "#f1f8fe",
            borderRadius: "2px 2px 0 0",
          }}
        >
          <Typography fontSize="18px" color="#2d2d2d" ml="15px">
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
        <Box sx={{ px: "28px", py: 2 }}>
          {managementPlans.map((plan, index) => (
            <ManagementPlanAccordion
              key={plan.id}
              attributes={plan}
              title={plan.name || `Management Plan ${index + 1}`}
              condition={condition}
              setCondition={setCondition}
              onDelete={handleDeletePlan}
            />
          ))}
        </Box>
      </Box>
    );
  }
);

export default ManagementPlanSection;
