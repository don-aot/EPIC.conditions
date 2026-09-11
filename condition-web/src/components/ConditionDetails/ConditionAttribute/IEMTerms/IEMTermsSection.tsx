import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import IEMTermsAccordion from "./IEMTermsAccordion";
import { ConditionModel } from "@/models/Condition";
import { useRemoveIEMTerms } from "@/hooks/api/useIEMTerms";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { useUpdateConditionDetails } from "@/hooks/api/useConditions";

type IEMTermsSectionProps = {
  condition: ConditionModel;
  setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
};

const IEMTermsSection = memo(({ condition, setCondition }: IEMTermsSectionProps) => {
  const iemTermsList = condition?.condition_attributes?.iem_terms || [];

  const { mutateAsync: removeIEMTerms } = useRemoveIEMTerms({
    onSuccess: () => notify.success("IEM Terms deleted"),
    onError: () => notify.error("Failed to delete IEM Terms"),
  });

  const { mutate: updateConditionDetails } = useUpdateConditionDetails(
    false,
    false,
    condition.condition_id
  );

  const handleDeleteTerms = async (termsId: string) => {
    await removeIEMTerms(termsId);
    setCondition((prev) => {
      const remainingTerms =
        prev.condition_attributes?.iem_terms?.filter((t) => t.id !== termsId) || [];
      const allApproved =
        remainingTerms.length > 0 && remainingTerms.every((t) => t.is_approved);
      if (prev.is_condition_attributes_approved !== allApproved) {
        updateConditionDetails({ is_condition_attributes_approved: allApproved });
      }
      return {
        ...prev,
        requires_iem_terms: remainingTerms.length > 0,
        is_condition_attributes_approved: allApproved,
        condition_attributes: {
          ...prev.condition_attributes,
          iem_terms: remainingTerms,
          management_plans: prev.condition_attributes?.management_plans || [],
          independent_attributes: prev.condition_attributes?.independent_attributes || [],
        },
      };
    });
  };

  if (iemTermsList.length === 0) return null;

  return (
    <Box>
      {/* Section header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1,
          backgroundColor: "#f1f8fe",
          borderRadius: "2px 2px 0 0",
        }}
      >
        <Typography fontSize="18px" color="#2d2d2d">
          IEM Terms of Engagement
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
          {iemTermsList.length}
        </Box>
      </Box>

      {/* Accordions */}
      <Box sx={{ pt: 2 }}>
        {iemTermsList.map((terms, index) => (
          <IEMTermsAccordion
            key={terms.id}
            attributes={terms}
            title={terms.name || `IEM Terms of Engagement ${index + 1}`}
            condition={condition}
            setCondition={setCondition}
            onDelete={handleDeleteTerms}
          />
        ))}
      </Box>
    </Box>
  );
});

export default IEMTermsSection;
