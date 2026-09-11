import React, { memo, useCallback, useEffect, useRef, useState } from "react";
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
import CloseIcon from "@mui/icons-material/Close";
import { useQueryClient } from "@tanstack/react-query";
import ManagementPlanSection from "./ManagementPlan/ManagementPlanSection";
import IEMTermsSection from "./IEMTerms/IEMTermsSection";
import ReportsSection from "./Reports/ReportsSection";
import AddReportForm, { AddReportFormHandle, ReportFormValues } from "./Reports/AddReportForm";
import { ConditionModel } from "@/models/Condition";
import { IEMTermsModel, ManagementPlanModel } from "@/models/ConditionAttribute";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";
import { useUpdateConditionAttributeDetails } from "@/hooks/api/useConditionAttribute";
import { useCreateReport } from "@/hooks/api/useReport";
import { QUERY_KEY } from "@/hooks/api/constants";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { createDefaultManagementPlan } from "./ManagementPlan/helpers";
import { createDefaultIEMTerms } from "./IEMTerms/helpers";
import {
  managementRequiredKeys,
  managementOptionalDefaultKeys,
  iemRequiredKeys,
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
      const planCount = condition.condition_attributes?.management_plans?.length ?? 0;
      if (condition.requires_management_plan && planCount > 0) init.push("management_plan");
      const termsCount = condition.condition_attributes?.iem_terms?.length ?? 0;
      if (condition.requires_iem_terms && termsCount > 0) init.push("iem_terms_of_engagement");
      if (condition.requires_report) init.push("report");
      return init;
    });

    const [showForm, setShowForm] = useState(false);
    const [pendingTypes, setPendingTypes] = useState<SubmissionType[]>([]);
    const [reportFormValues, setReportFormValues] = useState<ReportFormValues | null>(null);
    const [reportFormValid, setReportFormValid] = useState(false);
    const reportFormRef = useRef<AddReportFormHandle>(null);

    useEffect(() => {
      const planCount = condition.condition_attributes?.management_plans?.length ?? 0;
      if (planCount > 0) {
        setActiveTypes((prev) => prev.includes("management_plan") ? prev : [...prev, "management_plan"]);
      } else {
        setActiveTypes((prev) => prev.filter((t) => t !== "management_plan"));
      }
    }, [condition.condition_attributes?.management_plans]);

    useEffect(() => {
      const termsCount = condition.condition_attributes?.iem_terms?.length ?? 0;
      if (condition.requires_iem_terms && termsCount > 0) {
        setActiveTypes((prev) => prev.includes("iem_terms_of_engagement") ? prev : [...prev, "iem_terms_of_engagement"]);
      } else {
        setActiveTypes((prev) => prev.filter((t) => t !== "iem_terms_of_engagement"));
      }
    }, [condition.requires_iem_terms, condition.condition_attributes?.iem_terms]);

    useEffect(() => {
      if (condition.requires_report) {
        setActiveTypes((prev) => prev.includes("report") ? prev : [...prev, "report"]);
      } else {
        setActiveTypes((prev) => prev.filter((t) => t !== "report"));
      }
    }, [condition.requires_report]);

    const handleReportsEmpty = useCallback(() => {
      setActiveTypes((prev) => prev.filter((t) => t !== "report"));
      setCondition((prev) => ({ ...prev, requires_report: false }));
    }, [setCondition]);

    const { mutateAsync: updateAttributes } = useUpdateConditionAttributeDetails(
      condition.condition_id
    );

    const { mutateAsync: createReport, isPending: creatingReport } = useCreateReport(
      condition.condition_id
    );

    // Management Plan and Report can always be re-added; IEM is a one-time section.
    const availableToAdd = SUBMISSION_OPTIONS.filter((o) => {
      if (pendingTypes.includes(o.value)) return false;
      if (o.value === "management_plan" || o.value === "report") return true;
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
      if (type === "report") {
        setReportFormValues(null);
        setReportFormValid(false);
      }
    };

    const handleCancel = () => {
      setShowForm(false);
      setPendingTypes([]);
      setReportFormValues(null);
      setReportFormValid(false);
    };

    const handleConfirm = async () => {
      const addingMP = pendingTypes.includes("management_plan");
      const addingIEM = pendingTypes.includes("iem_terms_of_engagement");
      const addingReport = pendingTypes.includes("report");

      // Validate report form before any side effects so the form stays visible on error
      if (addingReport && !reportFormValid) {
        reportFormRef.current?.validate();
        return;
      }

      // Add non-report types immediately; "report" is added only after successful creation
      setActiveTypes((prev) => {
        const next = [...prev];
        pendingTypes.filter((t) => t !== "report").forEach((t) => {
          if (!next.includes(t)) next.push(t);
        });
        return next;
      });

      setShowForm(false);
      setPendingTypes([]);

      if (addingMP) {
        const existingPlans = condition.condition_attributes?.management_plans ?? [];
        const newPlan: ManagementPlanModel = createDefaultManagementPlan(
          `${existingPlans.length + 1}-${Date.now()}`,
          managementRequiredKeys,
          managementOptionalDefaultKeys
        );
        const updatedPlans = [...existingPlans, newPlan];

        setCondition((prev) => ({
          ...prev,
          condition_attributes: {
            independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
            management_plans: updatedPlans,
            iem_terms: prev.condition_attributes?.iem_terms ?? [],
          },
          subconditions: prev.subconditions,
        }));

        try {
          const response = await updateAttributes({
            requires_management_plan: true,
            condition_attribute: {
              independent_attributes: condition.condition_attributes?.independent_attributes ?? [],
              management_plans: updatedPlans,
              iem_terms: condition.condition_attributes?.iem_terms ?? [],
            },
          });

          const savedPlans = response?.management_plans ?? updatedPlans;
          setCondition((prev) => ({
            ...prev,
            condition_attributes: {
              independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
              management_plans: savedPlans,
              iem_terms: response?.iem_terms ?? prev.condition_attributes?.iem_terms ?? [],
            },
            subconditions: prev.subconditions,
          }));

          queryClient.invalidateQueries({ queryKey: ["conditions", condition.condition_id] });
          queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CONDITIONSDETAIL] });
          notify.success("Management Plan added successfully");
        } catch {
          setCondition((prev) => ({
            ...prev,
            condition_attributes: {
              independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
              management_plans: existingPlans,
              iem_terms: prev.condition_attributes?.iem_terms ?? [],
            },
            subconditions: prev.subconditions,
          }));
          notify.error("Failed to add management plan.");
        }
      }

      if (addingIEM) {
        const existingTerms = condition.condition_attributes?.iem_terms ?? [];
        const newTerms: IEMTermsModel = createDefaultIEMTerms(
          `${existingTerms.length + 1}-${Date.now()}`,
          iemRequiredKeys
        );
        const updatedTerms = [...existingTerms, newTerms];

        setCondition((prev) => ({
          ...prev,
          requires_iem_terms: true,
          condition_attributes: {
            independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
            management_plans: prev.condition_attributes?.management_plans ?? [],
            iem_terms: updatedTerms,
          },
          subconditions: prev.subconditions,
        }));

        try {
          const response = await updateAttributes({
            requires_iem_terms: true,
            condition_attribute: {
              independent_attributes: condition.condition_attributes?.independent_attributes ?? [],
              management_plans: condition.condition_attributes?.management_plans ?? [],
              iem_terms: updatedTerms,
            },
          });

          const savedTerms = response?.iem_terms ?? updatedTerms;
          setCondition((prev) => ({
            ...prev,
            condition_attributes: {
              independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
              management_plans: response?.management_plans ?? prev.condition_attributes?.management_plans ?? [],
              iem_terms: savedTerms,
            },
            subconditions: prev.subconditions,
          }));

          queryClient.invalidateQueries({ queryKey: ["conditions", condition.condition_id] });
          queryClient.invalidateQueries({ queryKey: [QUERY_KEY.CONDITIONSDETAIL] });
          notify.success("IEM Terms of Engagement added successfully");
        } catch {
          setCondition((prev) => ({
            ...prev,
            condition_attributes: {
              independent_attributes: prev.condition_attributes?.independent_attributes ?? [],
              management_plans: prev.condition_attributes?.management_plans ?? [],
              iem_terms: existingTerms,
            },
            subconditions: prev.subconditions,
          }));
          notify.error("Failed to add IEM Terms of Engagement.");
        }
      }

      if (addingReport) {
        try {
          await createReport(reportFormValues as never);
          setCondition((prev) => ({ ...prev, requires_report: true }));
          setReportFormValues(null);
          setReportFormValid(false);
          notify.success("Report added successfully");
        } catch {
          notify.error("Failed to add report.");
        }
      }
    };

    const canAddMore = canManage;
    const hasNoTypes = activeTypes.length === 0;

    const isConfirmDisabled = pendingTypes.length === 0 || creatingReport;

    const submissionTypeForm = (
      <>
        <Typography sx={{ fontSize: "14px", mb: 1 }}>
          Submission Type
        </Typography>

        <Select
          value=""
          onChange={handleDropdownChange}
          displayEmpty
          sx={{
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

        {/* Selected type chips */}
        {pendingTypes.length > 0 && (
          <Box display="flex" flexWrap="wrap" gap={1} mt={1.5}>
            {pendingTypes.map((type) => (
              <Chip
                key={type}
                label={labelFor(type)}
                onDelete={() => handleRemovePending(type)}
                deleteIcon={<CloseIcon />}
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
                    marginTop: "3px",
                  },
                }}
              />
            ))}
          </Box>
        )}

        {/* Embedded report form — appears inline when Report is pending */}
        {pendingTypes.includes("report") && (
          <Box
            sx={{
              mt: 2,
              border: "1px solid #d8d8d8",
              borderRadius: "4px",
              p: 2.5,
            }}
          >
            <AddReportForm
              ref={reportFormRef}
              embedded
              managementPlans={condition.condition_attributes?.management_plans ?? []}
              onChange={(values, isValid) => {
                setReportFormValues(values);
                setReportFormValid(isValid);
              }}
            />
          </Box>
        )}

        <Box display="flex" justifyContent="flex-end" gap={1.5} mt={3}>
          <Button variant="outlined" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            {creatingReport ? "Saving..." : "Confirm"}
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
              <IEMTermsSection
                condition={condition}
                setCondition={setCondition}
              />
            )}

            {activeTypes.includes("report") && (
              <ReportsSection
                condition={condition}
                onEmpty={handleReportsEmpty}
              />
            )}

            {/* "+ Add Submission Type" button */}
            {canAddMore && !showForm && (
              <Button
                variant="contained"
                onClick={() => setShowForm(true)}
                startIcon={<AddIcon />}
                sx={{ mt: 2 }}
                data-testid="add-submission-type-btn"
              >
                Add Submission Type
              </Button>
            )}

            {/* Inline form when adding more types */}
            {showForm && (
              <Box sx={{ pt: 2 }}>
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
