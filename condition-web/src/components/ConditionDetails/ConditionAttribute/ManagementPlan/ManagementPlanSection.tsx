import React, { memo } from "react";
import {
  Box,
  Button,
  CircularProgress
} from "@mui/material";
import { managementRequiredKeys, managementOptionalDefaultKeys } from "../../ConditionAttribute/Constants";
import { createDefaultManagementPlan } from "./helpers";
import ManagementPlanAccordion from "./ManagementPlanAccordion";
import { ManagementPlanModel } from "@/models/ConditionAttribute";
import { ConditionModel } from "@/models/Condition";
import { useUpdateConditionAttributeDetails } from "@/hooks/api/useConditionAttribute";
import { useRemoveManagementPlan } from "@/hooks/api/useManagementPlan";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEY } from "@/hooks/api/constants";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";
import { useUpdateConditionDetails } from "@/hooks/api/useConditions";

type ManagementPlanSectionProps = {
    condition: ConditionModel;
    setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
};

const ManagementPlanSection = memo(({ condition, setCondition, }: ManagementPlanSectionProps) => {
    const queryClient = useQueryClient();
    const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);

    const managementPlans = condition?.condition_attributes?.management_plans || [];

    const onCreateSuccess = () => {
      notify.success("Management Plan added successfully");
      queryClient.invalidateQueries({ queryKey: ["conditions", condition.condition_id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CONDITIONSDETAIL] });
    };
  
    const onCreateFailure = () => {
      notify.error("Failed to add management plan");
    };
  
    const { mutateAsync: updateAttributes, isPending: isUpdating } = useUpdateConditionAttributeDetails(
      condition.condition_id,
      {
        onSuccess: onCreateSuccess,
        onError: onCreateFailure,
      }
    );

    const { mutateAsync: removeManagementPlan } = useRemoveManagementPlan({
      onSuccess: () => {
        notify.success("Management plan deleted");
      },
      onError: () => {
        notify.error("Failed to delete management plan");
      },
    });

    const { mutate: updateConditionDetails } = useUpdateConditionDetails(
      false,
      false,
      condition.condition_id
    );

    const handleAddPlan = async () => {
      const newPlan: ManagementPlanModel = createDefaultManagementPlan(
        `(condition.condition_attributes?.length || 0) + 1-${Date.now()}`,
        managementRequiredKeys,
        managementOptionalDefaultKeys
      );
  
      try { 
        const updatedPlans = [...managementPlans, newPlan];

        const response = await updateAttributes({
          requires_management_plan: true,
          condition_attribute: {
            independent_attributes: condition.condition_attributes?.independent_attributes || [],
            management_plans: updatedPlans,
          },
        });

        const updatedResponsePlans = response?.management_plans ?? updatedPlans;

        // Update global condition state too
        setCondition((prev) => ({
          ...prev,
          condition_attributes: {
            independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
            management_plans: updatedResponsePlans,
          },
          subconditions: prev.subconditions, // preserve optional fields if needed
        }));

      } catch (error) {
        notify.error("Failed to add plan.");
      }
    };

    const handleDeletePlan = async (planId: string) => {
      await removeManagementPlan(planId);
      setCondition((prev) => {
        const remainingPlans = prev.condition_attributes?.management_plans?.filter(p => p.id !== planId) || [];
        const allApproved = remainingPlans.length > 0 && remainingPlans.every(p => p.is_approved);
        if (prev.is_condition_attributes_approved !== allApproved) {
          updateConditionDetails({ is_condition_attributes_approved: allApproved });
        }
        return {
          ...prev,
          is_condition_attributes_approved: allApproved,
          condition_attributes: {
            ...prev.condition_attributes,
            management_plans: remainingPlans,
            independent_attributes: prev.condition_attributes?.independent_attributes || [],
          },
        };
      });
    };

    return (
      <Box>
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

          {canManage && (isUpdating ? (
            <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
          ) : (
            <Button
                variant="outlined"
                onClick={handleAddPlan}
                sx={{ mt: 2 }}
                data-testid="add-management-plan-btn"
                >
                Add Management Plan
            </Button>
          ))}
      </Box>
    );
});

export default ManagementPlanSection;
