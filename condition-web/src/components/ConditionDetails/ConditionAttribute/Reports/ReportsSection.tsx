import { memo, useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";
import { ConditionModel } from "@/models/Condition";
import { ReportModel } from "@/models/ConditionAttribute";
import {
  useGetReports,
  useRemoveReport,
} from "@/hooks/api/useReport";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import ReportPhaseAccordion, { PhaseRow } from "./ReportPhaseAccordion";
import { PHASE_ORDER } from "./constants";
import DeleteConfirmationModal from "../ManagementPlan/DeleteConfirmationModal";

type Props = {
  condition: ConditionModel;
  onEmpty: () => void;
};

const ReportsSection = memo(({ condition, onEmpty }: Props) => {
  const [deletingReport, setDeletingReport] = useState<ReportModel | null>(null);

  const conditionId = condition.condition_id;

  const { data: reports = [], isLoading, refetch } = useGetReports(conditionId);

  const { mutateAsync: removeReport } = useRemoveReport(conditionId, {
    onSuccess: () => {
      notify.success("Report removed");
      setDeletingReport(null);
    },
    onError: () => notify.error("Failed to remove report"),
  });

  const { mutateAsync: silentRemoveReport } = useRemoveReport(conditionId, {
    onSuccess: () => refetch(),
    onError: () => {},
  });

  // Auto-delete reports that have no submissions left and hide the section when none remain.
  useEffect(() => {
    if (isLoading) return;
    const emptyReports = reports.filter((r: ReportModel) => (r.submissions ?? []).length === 0);
    emptyReports.forEach((r: ReportModel) => silentRemoveReport(r.id));
    const hasActiveReports = reports.some((r: ReportModel) => (r.submissions ?? []).length > 0);
    if (!hasActiveReports) {
      onEmpty();
    }
  }, [reports, isLoading, onEmpty, silentRemoveReport]);

  const confirmDelete = async () => {
    if (deletingReport) await removeReport(deletingReport.id);
  };

  // Group submissions by phase across all reports
  const managementPlans = condition.condition_attributes?.management_plans ?? [];

  const phaseMap: Record<string, PhaseRow[]> = {};
  reports.forEach((report: ReportModel) => {
    (report.submissions || []).forEach((sub) => {
      if (!phaseMap[sub.phase]) phaseMap[sub.phase] = [];
      const linkedPlan = managementPlans.find(
        (mp) => String(mp.id) === String(sub.linked_management_plan_id)
      );
      phaseMap[sub.phase].push({
        ...sub,
        reportType: report.report_type,
        reportId: report.id,
        linked_management_plan_name: linkedPlan?.name,
      });
    });
  });

  const sortedPhases = [
    ...PHASE_ORDER.filter((p) => phaseMap[p]),
    ...Object.keys(phaseMap).filter((p) => !PHASE_ORDER.includes(p)).sort(),
  ];

  return (
    <Box>
      {/* Section header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mx: "28px",
          mt: "28px",
          px: 2,
          py: 1,
          backgroundColor: "#f1f8fe",
          borderRadius: "2px 2px 0 0",
        }}
      >
        <Typography fontSize="18px" color="#2d2d2d">
          Reports
        </Typography>
      </Box>

      <Box sx={{ px: "28px", pt: 2 }}>
        {isLoading ? (
          <CircularProgress size={24} />
        ) : (
          <>
            {sortedPhases.map((phase) => (
              <ReportPhaseAccordion
                key={phase}
                phase={phase}
                rows={phaseMap[phase]}
                conditionId={conditionId}
                managementPlans={condition.condition_attributes?.management_plans ?? []}
                onRefetch={refetch}
              />
            ))}

            {sortedPhases.length === 0 && (
              <Typography fontSize="14px" color="text.secondary">
                No reports added yet.
              </Typography>
            )}
          </>
        )}
      </Box>

      <DeleteConfirmationModal
        open={!!deletingReport}
        title="Remove Report"
        description={`By removing this Report, you will lose all of its associated submission requirements.<br/><br/>Are you sure you wish to proceed?`}
        onClose={() => setDeletingReport(null)}
        onConfirm={confirmDelete}
      />
    </Box>
  );
});

export default ReportsSection;
