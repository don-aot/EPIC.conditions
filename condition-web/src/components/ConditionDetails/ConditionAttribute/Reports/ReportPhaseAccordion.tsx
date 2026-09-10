import React, { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditIcon from "@/components/Shared/Icons/EditIcon";
import DeleteIcon from "@/components/Shared/Icons/DeleteIcon";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import AddIcon from "@mui/icons-material/Add";
import { ManagementPlanModel, ReportSubmissionModel } from "@/models/ConditionAttribute";
import DeleteConfirmationModal from "../ManagementPlan/DeleteConfirmationModal";
import {
  useAddReportSubmission,
  usePatchReportSubmission,
  useRemoveReportSubmission,
} from "@/hooks/api/useReport";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { getFrequencies, PSN_SUBMISSION_TYPES, MT_TYPE } from "./constants";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";
import { BCDesignTokens } from "epic.theme";

const PSN_TYPE = "Project Status Notification";
const CN_TYPE = "Compliance Notification";
const CSR_TYPE = "Compliance Self-Report";
const MP_TYPE = "Management Plan Associated Report";
const TIMING_PLACEHOLDER = "e.g. within 30 days after the issuance of this Certificate.";

export type PhaseRow = ReportSubmissionModel & {
  reportType: string;
  reportId: number;
  linked_management_plan_name?: string;
};

type EditValues = {
  frequency: string;
  timing: string;
  condition_subsection: string;
  report_submission_type: string;
  linked_management_plan_id: number | null;
  report_title: string;
};

const toEditValues = (row: PhaseRow): EditValues => ({
  frequency: row.frequency ?? "",
  timing: row.timing ?? "",
  condition_subsection: row.condition_subsection ?? "",
  report_submission_type: row.report_submission_type ?? "",
  linked_management_plan_id: row.linked_management_plan_id ?? null,
  report_title: row.report_title ?? "",
});

type FrequencyStyle = { borderColor: string; background: string };

// Configurable frequency → visual style mapping.
// Yellow = recurring, Purple = one-time, Red = as-needed.
const FREQUENCY_STYLES: Record<string, FrequencyStyle> = {
  "As Needed":      { borderColor: "#CE3E39", background: "#F4E1E2" },
  "One Time":       { borderColor: "#6A54A3", background: "#DAD4E8" },
  "Annually":       { borderColor: "#F8BB47", background: "#FEF1D8" },
  "Semi-Annually":  { borderColor: "#F8BB47", background: "#FEF1D8" },
  "Quarterly":      { borderColor: "#F8BB47", background: "#FEF1D8" },
  "Monthly":        { borderColor: "#F8BB47", background: "#FEF1D8" },
  "Weekly":         { borderColor: "#F8BB47", background: "#FEF1D8" },
  "Other":          { borderColor: "#F8BB47", background: "#FEF1D8" },
};
const FREQUENCY_STYLE_DEFAULT: FrequencyStyle = { borderColor: "#aaa", background: "#f5f5f5" };

const FrequencyChip = ({ value }: { value: string }) => {
  const style = FREQUENCY_STYLES[value] ?? FREQUENCY_STYLE_DEFAULT;
  return (
    <Box
      sx={{
        display: "inline-flex",
        padding: "2px 8px",
        alignItems: "center",
        flexShrink: 0,
        borderRadius: "10px",
        border: `1px solid ${style.borderColor}`,
        background: style.background,
        fontSize: "11px",
        color: "#2D2D2D",
        whiteSpace: "nowrap",
        lineHeight: "17px",
      }}
    >
      {value || "—"}
    </Box>
  );
};

const SubsectionTypeBadge = ({ subsection, type }: { subsection?: string; type?: string }) => (
  <Box display="flex" alignItems="center" gap={0.75}>
    {subsection && (
      <Box
        sx={{
          height: "21px",
          padding: "2px 8px",
          flexShrink: 0,
          borderRadius: "4px",
          border: "1px solid #013366",
          background: "#D8EAFD",
          fontSize: "11px",
          fontWeight: 600,
          color: "#013366",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
        }}
      >
        {subsection}
      </Box>
    )}
    <Typography fontSize="13px">{type || "—"}</Typography>
  </Box>
);

type Props = {
  phase: string;
  rows: PhaseRow[];
  conditionId?: number;
  managementPlans?: ManagementPlanModel[];
  onRefetch: () => Promise<unknown>;
};

const ReportPhaseAccordion: React.FC<Props> = ({ phase, rows, conditionId, managementPlans = [], onRefetch }) => {
  const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editMap, setEditMap] = useState<Record<number, EditValues>>({});
  const [newSubs, setNewSubs] = useState<Record<string, EditValues | null>>({});
  const [confirmRemoveType, setConfirmRemoveType] = useState<string | null>(null);
  const [confirmRemovePhase, setConfirmRemovePhase] = useState(false);
  const [freqErrors, setFreqErrors] = useState<Record<string, boolean>>({});
  const [confirmError, setConfirmError] = useState(false);

  const allApproved = rows.length > 0 && rows.every((r) => r.is_approved);
  const isPSN = rows.some((r) => r.reportType === PSN_TYPE);
  const hasDataEntryRequired = rows.some((r) => r.reportType === MP_TYPE && !r.linked_management_plan_id);


  const { mutateAsync: patchSubmission, isPending: saving } = usePatchReportSubmission(conditionId);
  const { mutateAsync: removeSubmission } = useRemoveReportSubmission(conditionId);
  const { mutateAsync: addSubmission } = useAddReportSubmission(conditionId);

  const enterEdit = () => {
    const map: Record<number, EditValues> = {};
    rows.forEach((r) => { map[r.id] = toEditValues(r); });
    setEditMap(map);
    setNewSubs({});
    setEditMode(true);
    setExpanded(true);
  };

const saveAll = async () => {
    const errors: Record<string, boolean> = {};
    rows.forEach((row) => {
      if (!editMap[row.id]?.frequency) errors[`row_${row.id}`] = true;
    });
    Object.entries(newSubs).forEach(([reportType, newSub]) => {
      if (newSub && !newSub.frequency) errors[`new_${reportType}`] = true;
    });
    if (Object.keys(errors).length > 0) {
      setFreqErrors(errors);
      return;
    }
    setFreqErrors({});
    try {
      await Promise.all(
        rows.map((row) => patchSubmission({ submissionId: row.id, payload: editMap[row.id] }))
      );
      await Promise.all(
        Object.entries(newSubs).map(([reportType, newSub]) => {
          if (!newSub) return Promise.resolve();
          const reportId = byType[reportType]?.[0]?.reportId;
          if (!reportId) return Promise.resolve();
          return addSubmission({ reportId, payload: { phases: [phase], ...newSub } });
        })
      );
      await onRefetch();
      setEditMode(false);
      setEditMap({});
      setNewSubs({});
      notify.success("Changes saved");
    } catch {
      notify.error("Failed to save changes");
    }
  };

  const handleDeleteRow = async (submissionId: number) => {
    try {
      await removeSubmission(submissionId);
      onRefetch();
      notify.success("Submission removed");
    } catch {
      notify.error("Failed to remove submission");
    }
  };

  const handleDeletePhase = async () => {
    try {
      await Promise.all(rows.map((r) => removeSubmission(r.id)));
      onRefetch();
      setConfirmRemovePhase(false);
      notify.success("Phase removed");
    } catch {
      notify.error("Failed to remove phase");
    }
  };

  const handleApprove = async () => {
    if (!allApproved && hasDataEntryRequired) {
      setConfirmError(true);
      return;
    }
    setConfirmError(false);
    const next = !allApproved;
    try {
      await Promise.all(
        rows.map((r) => patchSubmission({ submissionId: r.id, payload: { is_approved: next } }))
      );
      onRefetch();
      notify.success(next ? "Report confirmed" : "Confirmation removed");
    } catch {
      notify.error("Failed to update approval");
    }
  };

  const setEdit = (id: number, key: keyof EditValues, value: string) =>
    setEditMap((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  const setNewField = (reportType: string, key: keyof EditValues, value: string) =>
    setNewSubs((prev) => ({
      ...prev,
      [reportType]: {
        ...(prev[reportType] ?? { frequency: "", timing: "", condition_subsection: "", report_submission_type: "", linked_management_plan_id: null, report_title: "" }),
        [key]: value,
      },
    }));

  const handleDeleteReportType = async (reportType: string) => {
    const rowsToDelete = byType[reportType] || [];
    try {
      await Promise.all(rowsToDelete.map((r) => removeSubmission(r.id)));
      onRefetch();
      setConfirmRemoveType(null);
      notify.success(`${reportType} removed`);
    } catch {
      notify.error("Failed to remove report type");
    }
  };

  // Group rows by reportType for display
  const byType: Record<string, PhaseRow[]> = {};
  rows.forEach((r) => {
    if (!byType[r.reportType]) byType[r.reportType] = [];
    byType[r.reportType].push(r);
  });

  const statusChip = (
    <Chip
      label={hasDataEntryRequired ? "Data Entry Required" : allApproved ? "Confirmed" : "Awaiting Confirmation"}
      sx={{
        height: "24px",
        padding: "2px 8px",
        alignItems: "center",
        gap: "8px",
        justifyContent: "center",
        "& .MuiChip-label": { px: 0 },
        background: hasDataEntryRequired
          ? "var(--support-surfaceColor-danger, #F4E1E2)"
          : allApproved
          ? "var(--support-surfaceColor-success, #F6FFF8)"
          : "var(--support-surfaceColor-warning, #FEF1D8)",
        border: hasDataEntryRequired
          ? "1px solid var(--support-borderColor-danger, #CE3E39)"
          : allApproved
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
  );

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, v) => { if (!editMode) setExpanded(v); }}
      disableGutters
      sx={{
        mb: 1,
        border: "1px solid #d8d8d8",
        borderRadius: "4px !important",
        "&:before": { display: "none" },
        boxShadow: "none",
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 2, minHeight: 48, "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1 } }}
      >
        {/* Left: phase name + count */}
        <Typography fontWeight={600} fontSize="14px">{phase}</Typography>
        <Chip
          label={rows.length}
          size="small"
          sx={{ backgroundColor: "#e8e8e8", color: "#555", fontSize: "11px", height: 20, borderRadius: "100px" }}
        />

        {/* Right: status + trash */}
        <Box flex={1} />
        {statusChip}
        {canManage && (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setConfirmRemovePhase(true); }}
            sx={{ color: "#888", mr: 0.5 }}
          >
            <DeleteIcon size={16} />
          </IconButton>
        )}
      </AccordionSummary>

      <AccordionDetails sx={{ p: 0 }}>
        {/* Submission Requirements header row */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1, borderTop: "1px solid #e8e8e8" }}
        >
          <Typography fontSize="13px" color="text.secondary">
            Submission Requirements
          </Typography>
          {canManage && (
            editMode ? (
              <Box display="flex" gap={2} alignItems="center">
                <Button
                  size="small"
                  disableRipple
                  startIcon={<SaveAltIcon sx={{ fontSize: "16px !important", color: BCDesignTokens.typographyColorLink }} />}
                  onClick={saveAll}
                  disabled={saving}
                  sx={{
                    fontSize: "14px",
                    fontWeight: 700,
                    textTransform: "none",
                    color: BCDesignTokens.typographyColorLink,
                    p: 0,
                    minWidth: 0,
                    background: "transparent",
                    "& .MuiButton-startIcon": { marginRight: "4px" },
                    "&:hover": { background: "transparent", textDecoration: "underline" },
                    "&:active": { background: "transparent" },
                    "&:focus": { background: "transparent" },
                  }}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </Box>
            ) : (
              <Button
                size="small"
                disableRipple
                startIcon={<EditIcon size={16} />}
                onClick={enterEdit}
                sx={{
                  fontSize: "14px",
                  fontWeight: 700,
                  textTransform: "none",
                  color: BCDesignTokens.typographyColorLink,
                  p: 0,
                  minWidth: 0,
                  background: "transparent",
                  "& .MuiButton-startIcon": { marginRight: "4px" },
                  "&:hover": { background: "transparent", textDecoration: "underline" },
                  "&:active": { background: "transparent" },
                  "&:focus": { background: "transparent" },
                }}
              >
                Edit
              </Button>
            )
          )}
        </Box>

        {/* Per-report-type table */}
        {Object.entries(byType).map(([reportType, typeRows]) => {
          const isCN = reportType === CN_TYPE || reportType === CSR_TYPE;
          const isMP = reportType === MP_TYPE;
          const isMT = reportType === MT_TYPE;
          return (
          <TableContainer key={reportType} sx={{ mb: 1 }}>
            <Table size="small" sx={{ width: "100%", tableLayout: "fixed", "& td": { verticalAlign: "middle" } }}>
              <TableHead>
                {/* Report type gray header */}
                <TableRow sx={{ backgroundColor: "#f0f0f0" }}>
                  <TableCell
                    colSpan={isCN ? 2 : isMP ? 4 : 3}
                    sx={{ fontWeight: 700, fontSize: "13px", py: 0.75, color: "#333" }}
                  >
                    {reportType}
                  </TableCell>
                  <TableCell sx={{ py: 0.75, textAlign: "right", width: "12%" }}>
                    {canManage && editMode && (
                      <Button
                        size="small"
                        disableRipple
                        onClick={() => setConfirmRemoveType(reportType)}
                        sx={{
                          fontSize: "12px",
                          fontWeight: 400,
                          fontFamily: '"BC Sans"',
                          lineHeight: "18px",
                          textAlign: "center",
                          textTransform: "none",
                          whiteSpace: "nowrap",
                          color: "#D32F2F",
                          p: 0,
                          minWidth: 0,
                          background: "transparent",
                          "&:hover": { background: "transparent", textDecoration: "underline" },
                          "&:active": { background: "transparent" },
                          "&:focus": { background: "transparent" },
                        }}
                      >
                        Remove Report
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {/* Column headers */}
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", py: 0.5, width: isCN ? "44%" : isMP ? "16%" : "28%" }}>
                    Frequency
                  </TableCell>
                  {isMP && (
                    <>
                      <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", py: 0.5, width: "24%" }}>
                        Linked Management Plan
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", py: 0.5, width: "22%" }}>
                        Report Title
                      </TableCell>
                    </>
                  )}
                  {isMT && (
                    <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", py: 0.5, width: "28%" }}>
                      Report Title
                    </TableCell>
                  )}
                  {!isCN && !isMP && !isMT && (
                    <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", py: 0.5, width: "28%" }}>
                      {reportType === PSN_TYPE ? "Sub-Condition + Type" : "Type"}
                    </TableCell>
                  )}
                  <TableCell sx={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", py: 0.5, width: isCN ? "44%" : isMP ? "26%" : "32%" }}>
                    Timing
                  </TableCell>
                  <TableCell sx={{ width: "12%" }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {typeRows.map((row) => {
                  const ev = editMap[row.id];
                  return (
                    <TableRow key={row.id} hover>
                      {/* Frequency */}
                      <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                        {editMode ? (
                          <Select
                            value={ev?.frequency ?? ""}
                            onChange={(e) => { setEdit(row.id, "frequency", e.target.value); setFreqErrors((p) => ({ ...p, [`row_${row.id}`]: false })); }}
                            size="small"
                            error={!!freqErrors[`row_${row.id}`]}
                            sx={{ width: "100%", fontSize: "14px" }}
                          >
                            {getFrequencies(reportType).map((f: { value: string; label: string }) => (
                              <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                            ))}
                          </Select>
                        ) : (
                          <FrequencyChip value={row.frequency} />
                        )}
                      </TableCell>

                      {/* MP: separate Linked Management Plan and Report Title columns */}
                      {isMP && (
                        <>
                          <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                            {editMode ? (
                              <Select
                                value={ev?.linked_management_plan_id ?? -1}
                                onChange={(e) => setEditMap((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    ...prev[row.id],
                                    linked_management_plan_id: Number(e.target.value) > 0 ? Number(e.target.value) : null,
                                  },
                                }))}
                                size="small"
                                fullWidth
                                sx={{ fontSize: "14px", "& .MuiSelect-select": { color: (ev?.linked_management_plan_id ?? -1) > 0 ? "inherit" : "rgba(0,0,0,0.38)" } }}
                              >
                                <MenuItem value={-1}><em>Select management plan...</em></MenuItem>
                                {managementPlans.map((mp, idx) => (
                                  <MenuItem key={mp.id} value={Number(mp.id)}>{mp.name || `Management Plan ${idx + 1}`}</MenuItem>
                                ))}
                              </Select>
                            ) : (
                              <Typography fontSize="13px">
                                {(() => {
                                  const planId = row.linked_management_plan_id;
                                  if (!planId) return "—";
                                  const idx = managementPlans.findIndex((mp) => Number(mp.id) === Number(planId));
                                  if (idx < 0) return "—";
                                  const mp = managementPlans[idx];
                                  return mp.name || `Management Plan ${idx + 1}`;
                                })()}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                            {editMode ? (
                              <TextField
                                value={ev?.report_title ?? ""}
                                onChange={(e) => setEdit(row.id, "report_title", e.target.value)}
                                size="small"
                                placeholder="Report title..."
                                fullWidth
                                sx={{mt:3}}
                              />
                            ) : (
                              <Typography fontSize="13px">{row.report_title || "—"}</Typography>
                            )}
                          </TableCell>
                        </>
                      )}

                      {/* Monitoring/Technical: Report Title column */}
                      {isMT && (
                        <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                          {editMode ? (
                            <TextField
                              value={ev?.report_title ?? ""}
                              onChange={(e) => setEdit(row.id, "report_title", e.target.value)}
                              size="small"
                              placeholder="Report title..."
                              fullWidth
                              sx={{ mt: 3 }}
                            />
                          ) : (
                            <Typography fontSize="13px">{row.report_title || "—"}</Typography>
                          )}
                        </TableCell>
                      )}

                      {/* Type column — PSN/other report types */}
                      {!isCN && !isMP && !isMT && (
                        <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                          {editMode ? (
                            <Box display="flex" gap={1} flexDirection="row" alignItems="center">
                              <TextField
                                value={ev?.condition_subsection ?? ""}
                                onChange={(e) => setEdit(row.id, "condition_subsection", e.target.value)}
                                size="small"
                                placeholder="e.g. 4.1"
                                sx={{ width: 72, mt: 3, flexShrink: 0 }}
                              />
                              {isPSN && (
                                <Select
                                  value={ev?.report_submission_type ?? ""}
                                  onChange={(e) => setEdit(row.id, "report_submission_type", e.target.value)}
                                  size="small"
                                  displayEmpty
                                  sx={{ flex: 1, minWidth: 0, fontSize: "14px", "& .MuiSelect-select": { color: ev?.report_submission_type ? "inherit" : "rgba(0,0,0,0.38)" } }}
                                >
                                  <MenuItem value=""><em>Select...</em></MenuItem>
                                  {PSN_SUBMISSION_TYPES.map((t) => (
                                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                                  ))}
                                </Select>
                              )}
                            </Box>
                          ) : (
                            <SubsectionTypeBadge
                              subsection={row.condition_subsection}
                              type={row.report_submission_type || (isPSN ? undefined : reportType)}
                            />
                          )}
                        </TableCell>
                      )}

                      {/* Timing */}
                      <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                        {editMode ? (
                          <TextField
                            value={ev?.timing ?? ""}
                            onChange={(e) => setEdit(row.id, "timing", e.target.value)}
                            size="small"
                            placeholder={TIMING_PLACEHOLDER}
                            fullWidth
                            minRows={1}
                            sx={{ mt: 3 }}
                          />
                        ) : (
                          <Typography fontSize="13px">{row.timing || "—"}</Typography>
                        )}
                      </TableCell>

                      {/* Remove row (edit mode only, when multiple rows) */}
                      <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                        {editMode && typeRows.length > 1 && (
                          <Button
                            size="small"
                            disableRipple
                            onClick={() => handleDeleteRow(row.id)}
                            sx={{
                              fontSize: "12px",
                              fontWeight: 400,
                              fontFamily: '"BC Sans"',
                              lineHeight: "18px",
                              textAlign: "center",
                              textTransform: "none",
                              color: "#D32F2F",
                              p: 0,
                              minWidth: 0,
                              background: "transparent",
                              "&:hover": { background: "transparent", textDecoration: "underline" },
                              "&:active": { background: "transparent" },
                              "&:focus": { background: "transparent" },
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* New submission row per report type */}
                {editMode && newSubs[reportType] !== null && newSubs[reportType] !== undefined && (
                  <TableRow>
                    <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                      <Select
                        value={newSubs[reportType]!.frequency}
                        onChange={(e) => { setNewField(reportType, "frequency", e.target.value); setFreqErrors((p) => ({ ...p, [`new_${reportType}`]: false })); }}
                        size="small"
                        error={!!freqErrors[`new_${reportType}`]}
                        sx={{ width: "100%", fontSize: "14px", "& .MuiSelect-select": { color: newSubs[reportType]!.frequency ? "inherit" : "rgba(0,0,0,0.38)" } }}
                        displayEmpty
                      >
                        <MenuItem value="" disabled><em>Frequency</em></MenuItem>
                        {getFrequencies(reportType).map((f: { value: string; label: string }) => (
                          <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    {isMP && (
                      <>
                        <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                          <Select
                            value={newSubs[reportType]!.linked_management_plan_id ?? -1}
                            onChange={(e) => setNewSubs((prev) => ({
                              ...prev,
                              [reportType]: {
                                ...prev[reportType]!,
                                linked_management_plan_id: Number(e.target.value) > 0 ? Number(e.target.value) : null,
                              },
                            }))}
                            size="small"
                            fullWidth
                            sx={{ fontSize: "14px", "& .MuiSelect-select": { color: (newSubs[reportType]!.linked_management_plan_id ?? -1) > 0 ? "inherit" : "rgba(0,0,0,0.38)" } }}
                          >
                            <MenuItem value={-1}><em>Select management plan...</em></MenuItem>
                            {managementPlans.map((mp, idx) => (
                              <MenuItem key={mp.id} value={Number(mp.id)}>{mp.name || `Management Plan ${idx + 1}`}</MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                          <TextField
                            value={newSubs[reportType]!.report_title ?? ""}
                            onChange={(e) => setNewField(reportType, "report_title", e.target.value)}
                            size="small"
                            placeholder="Report title..."
                            fullWidth
                            sx={{ mt: 3 }}
                            inputProps={{ style: { fontSize: "14px" } }}
                          />
                        </TableCell>
                      </>
                    )}
                    {isMT && (
                      <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                        <TextField
                          value={newSubs[reportType]!.report_title ?? ""}
                          onChange={(e) => setNewField(reportType, "report_title", e.target.value)}
                          size="small"
                          placeholder="Report title..."
                          fullWidth
                          sx={{ mt: 3 }}
                          inputProps={{ style: { fontSize: "14px" } }}
                        />
                      </TableCell>
                    )}
                    {!isCN && !isMP && !isMT && (
                      <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                        <Box display="flex" gap={1} flexDirection="row" alignItems="center">
                          <TextField
                            value={newSubs[reportType]!.condition_subsection}
                            onChange={(e) => setNewField(reportType, "condition_subsection", e.target.value)}
                            size="small"
                            placeholder="e.g. 4.1"
                            sx={{ width: 72, mt: 3, flexShrink: 0 }}
                            inputProps={{ style: { fontSize: "14px" } }}
                          />
                          {isPSN && (
                            <Select
                              value={newSubs[reportType]!.report_submission_type}
                              onChange={(e) => setNewField(reportType, "report_submission_type", e.target.value)}
                              size="small"
                              displayEmpty
                              sx={{ flex: 1, minWidth: 0, fontSize: "14px", "& .MuiSelect-select": { color: newSubs[reportType]!.report_submission_type ? "inherit" : "rgba(0,0,0,0.38)" } }}
                            >
                              <MenuItem value=""><em>Select type...</em></MenuItem>
                              {PSN_SUBMISSION_TYPES.map((t) => (
                                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                              ))}
                            </Select>
                          )}
                        </Box>
                      </TableCell>
                    )}
                    <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                      <TextField
                        value={newSubs[reportType]!.timing}
                        onChange={(e) => setNewField(reportType, "timing", e.target.value)}
                        size="small"
                        placeholder={TIMING_PLACEHOLDER}
                        fullWidth
                        sx={{ mt: 3 }}
                        inputProps={{ style: { fontSize: "14px" } }}
                      />
                    </TableCell>
                    <TableCell sx={{ py: 1, verticalAlign: "middle" }}>
                      <Button
                        size="small"
                        disableRipple
                        onClick={() => setNewSubs((prev) => ({ ...prev, [reportType]: null }))}
                        sx={{
                          fontSize: "12px",
                          fontWeight: 400,
                          fontFamily: '"BC Sans"',
                          lineHeight: "18px",
                          textAlign: "center",
                          textTransform: "none",
                          color: "#D32F2F",
                          p: 0,
                          minWidth: 0,
                          background: "transparent",
                          "&:hover": { background: "transparent", textDecoration: "underline" },
                          "&:active": { background: "transparent" },
                          "&:focus": { background: "transparent" },
                        }}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {editMode && !(newSubs[reportType] !== null && newSubs[reportType] !== undefined) && (
              <Box px={2} pb={1} pt={0.5}>
                <Button
                  size="small"
                  disableRipple
                  onClick={() => setNewSubs((prev) => ({
                    ...prev,
                    [reportType]: { frequency: "", timing: "", condition_subsection: "", report_submission_type: "", linked_management_plan_id: null, report_title: "" },
                  }))}
                  startIcon={<AddIcon sx={{ fontSize: "13px !important" }} />}
                  sx={{
                    fontSize: "13px",
                    fontWeight: 400,
                    textTransform: "none",
                    color: BCDesignTokens.typographyColorLink,
                    p: 0,
                    minWidth: 0,
                    background: "transparent",
                    "& .MuiButton-startIcon": { marginRight: "4px" },
                    "&:hover": { background: "transparent", textDecoration: "underline" },
                    "&:active": { background: "transparent" },
                    "&:focus": { background: "transparent" },
                  }}
                >
                  Add Submission Requirement
                </Button>
              </Box>
            )}
        </TableContainer>
          );
        })}

        {/* Approve Report button (hidden in edit mode) */}
        {!editMode && canManage && (
          <Box display="flex" flexDirection="column" alignItems="flex-end" px={2} pb={2} pt={1} gap={0.5}>
            <Button
              variant="contained"
              size="small"
              onClick={handleApprove}
              sx={{ textTransform: "none" }}
            >
              {allApproved ? "Un-confirm Report" : "Confirm Report"}
            </Button>
            {confirmError && (
              <Typography fontSize="12px" color="error">
                Link a Management Plan before confirming
              </Typography>
            )}
          </Box>
        )}
      </AccordionDetails>

      <DeleteConfirmationModal
        open={!!confirmRemoveType}
        title="Remove Report"
        description={`This will remove the <strong>${confirmRemoveType}</strong> from the phase <strong>${phase}</strong>.<br/>Are you sure you wish to proceed?`}
        onClose={() => setConfirmRemoveType(null)}
        onConfirm={() => confirmRemoveType && handleDeleteReportType(confirmRemoveType)}
      />

      <DeleteConfirmationModal
        open={confirmRemovePhase}
        title="Remove Phase"
        description={`This will remove the <strong>${phase}</strong> phase.<br/>Are you sure you wish to proceed?`}
        onClose={() => setConfirmRemovePhase(false)}
        onConfirm={handleDeletePhase}
      />
    </Accordion>
  );
};

export default ReportPhaseAccordion;
