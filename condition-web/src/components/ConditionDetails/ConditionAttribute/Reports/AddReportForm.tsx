import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@/components/Shared/Icons/DeleteIcon";
import { ManagementPlanModel } from "@/models/ConditionAttribute";
import {
  PHASE_ORDER,
  getFrequencies,
  REPORT_TYPES,
  PSN_SUBMISSION_TYPES,
  MT_TYPE,
} from "./constants";

const PSN_TYPE = "Project Status Notification";
const TIMING_PLACEHOLDER = "e.g. within 30 days after the issuance of this Certificate.";

export interface SubmissionEntry {
  phases: string[];
  frequency: string;
  timing: string;
  condition_subsection?: string;
  report_submission_type?: string;
}

export interface ReportFormValues {
  report_type: string;
  report_title?: string;
  linked_management_plan_id?: number;
  submissions: SubmissionEntry[];
}

const emptySubmission = (isPSN: boolean): SubmissionEntry => ({
  phases: [],
  frequency: "",
  timing: "",
  ...(isPSN ? { condition_subsection: "", report_submission_type: "" } : {}),
});

const defaultForm = (): ReportFormValues => ({
  report_type: "",
  report_title: "",
  linked_management_plan_id: undefined,
  submissions: [emptySubmission(false)],
});

const checkValid = (f: ReportFormValues): boolean => {
  if (!f.report_type) return false;
  return f.submissions.every((s) => s.phases.length > 0 && Boolean(s.frequency));
};

type Props = {
  managementPlans?: ManagementPlanModel[];
  /** Standalone mode: renders own Save/Cancel buttons */
  onSave?: (values: ReportFormValues) => void;
  onCancel?: () => void;
  saving?: boolean;
  /** Embedded mode: no own buttons; parent is notified on every change */
  embedded?: boolean;
  onChange?: (values: ReportFormValues, isValid: boolean) => void;
};

export type AddReportFormHandle = { validate: () => boolean };

const AddReportForm = forwardRef<AddReportFormHandle, Props>(({
  managementPlans = [],
  onSave,
  onCancel,
  saving,
  embedded = false,
  onChange,
}, ref) => {
  const [form, setForm] = useState<ReportFormValues>(defaultForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isPSN = form.report_type === PSN_TYPE;
  const isMP = form.report_type === "Management Plan Associated Report";
  const isMT = form.report_type === MT_TYPE;
  const frequencies = getFrequencies(form.report_type);

  // Notify parent whenever form changes (embedded mode)
  useEffect(() => {
    if (onChange) onChange(form, checkValid(form));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.report_type) next.report_type = "Report type is required.";
    form.submissions.forEach((sub, i) => {
      if (sub.phases.length === 0) next[`phases_${i}`] = "Please indicate the phase(s) associated with this Report.";
      if (!sub.frequency) next[`frequency_${i}`] = "Frequency is required.";
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  useImperativeHandle(ref, () => ({ validate }));

  const handleSave = () => {
    if (validate()) onSave?.(form);
  };

  const setField = <K extends keyof ReportFormValues>(key: K, value: ReportFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateSub = (i: number, key: keyof SubmissionEntry, value: unknown) =>
    setForm((prev) => {
      const subs = [...prev.submissions];
      subs[i] = { ...subs[i], [key]: value };
      return { ...prev, submissions: subs };
    });

  const togglePhase = (i: number, phase: string) =>
    setForm((prev) => {
      const subs = [...prev.submissions];
      const cur = subs[i].phases;
      subs[i] = { ...subs[i], phases: cur.includes(phase) ? cur.filter((p) => p !== phase) : [...cur, phase] };
      return { ...prev, submissions: subs };
    });

  const addSubmission = () =>
    setForm((prev) => ({ ...prev, submissions: [...prev.submissions, emptySubmission(isPSN)] }));

  const removeSubmission = (i: number) =>
    setForm((prev) => ({ ...prev, submissions: prev.submissions.filter((_, idx) => idx !== i) }));

  const handleTypeChange = (value: string) => {
    const newIsPSN = value === PSN_TYPE;
    setForm({ report_type: value, report_title: "", linked_management_plan_id: undefined, submissions: [emptySubmission(newIsPSN)] });
    setErrors({});
  };

  const fieldWidth = embedded ? "100%" : 400;

  return (
    <Box>
      <Typography fontWeight={700} fontSize="16px" mb={2}>
        Report Information
      </Typography>

      {/* Report Type */}
      <Box mb={2}>
        <Typography fontSize="14px" mb={0.5}>
          Report Type
        </Typography>
        <Select
          value={form.report_type}
          onChange={(e) => handleTypeChange(e.target.value)}
          displayEmpty
          sx={{ width: fieldWidth, height: 40, "& .MuiSelect-select": { color: form.report_type ? "inherit" : "rgba(0,0,0,0.38)" } }}
          error={!!errors.report_type}
        >
          <MenuItem value="" disabled><em>Select report type...</em></MenuItem>
          {REPORT_TYPES.map((t) => (
            <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
          ))}
        </Select>
        {errors.report_type && <FormHelperText error>{errors.report_type}</FormHelperText>}
      </Box>

      {/* Submission Requirements header */}
      <Typography fontWeight={700} fontSize="14px" mb={1.5}>
        Submission Requirements
      </Typography>

      {/* MP-specific top-level fields */}
      {isMP && (
        <Box mb={2}>
          <Typography fontSize="14px" mb={0.5}>Linked Management Plan</Typography>
          <Select
            value={form.linked_management_plan_id ?? ""}
            onChange={(e) => setField("linked_management_plan_id", e.target.value ? Number(e.target.value) : undefined)}
            displayEmpty
            sx={{ width: fieldWidth, height: 40, "& .MuiSelect-select": { color: form.linked_management_plan_id ? "inherit" : "rgba(0,0,0,0.38)" } }}
          >
            {managementPlans.map((mp) => (
              <MenuItem key={mp.id} value={mp.id}>{mp.name || `Management Plan ${mp.id}`}</MenuItem>
            ))}
          </Select>
        </Box>
      )}

      {/* Report Title: Management Plan Associated Report and Monitoring/Technical Report */}
      {(isMP || isMT) && (
        <Box mb={2}>
          <Typography fontSize="14px" mb={0.5}>Report Title</Typography>
          <TextField
            value={form.report_title ?? ""}
            onChange={(e) => setField("report_title", e.target.value)}
            placeholder="Enter report title..."
            size="small"
            sx={{ width: fieldWidth }}
          />
        </Box>
      )}

      {/* Per-submission blocks */}
      {form.submissions.map((sub, i) => (
        <Box key={i} mb={2}>
          {form.submissions.length > 1 && (
            <Box display="flex" justifyContent="flex-end" mt={3} mb={0.5}>
              <Tooltip title="Remove submission requirement">
                <IconButton size="small" onClick={() => removeSubmission(i)}>
                  <DeleteIcon size={20} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {/* PSN: Subcondition + Type */}
          {isPSN && (
            <Box mb={1.5} display="flex" gap={2}>
              <Box flex={1}>
                <Typography fontSize="14px" mb={0.5}>Subcondition Number</Typography>
                <TextField
                  value={sub.condition_subsection ?? ""}
                  onChange={(e) => updateSub(i, "condition_subsection", e.target.value)}
                  placeholder="e.g. 4.1"
                  size="small"
                  fullWidth
                  inputProps={{ style: { fontSize: "14px" } }}
                />
              </Box>
              <Box flex={2}>
                <Typography fontSize="14px" mb={0.5}>Type</Typography>
                <Select
                  value={sub.report_submission_type ?? ""}
                  onChange={(e) => updateSub(i, "report_submission_type", e.target.value)}
                  displayEmpty
                  size="small"
                  fullWidth
                  sx={{ height: 40, "& .MuiSelect-select": { color: sub.report_submission_type ? "inherit" : "rgba(0,0,0,0.38)" } }}
                >
                  <MenuItem value=""><em>Select type...</em></MenuItem>
                  {PSN_SUBMISSION_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </Select>
              </Box>
            </Box>
          )}

          {/* Frequency */}
          <Box mb={1.5}>
            <Typography fontSize="14px" mb={0.5}>Frequency<span style={{ color: "#D32F2F" }}>*</span></Typography>
            <Select
              value={sub.frequency}
              onChange={(e) => updateSub(i, "frequency", e.target.value)}
              displayEmpty
              sx={{ width: fieldWidth, height: 40, "& .MuiSelect-select": { color: sub.frequency ? "inherit" : "rgba(0,0,0,0.38)" } }}
              error={!!errors[`frequency_${i}`]}
            >
              <MenuItem value="" disabled><em>Select frequency...</em></MenuItem>
              {frequencies.map((f: { value: string; label: string }) => (
                <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
              ))}
            </Select>
            {errors[`frequency_${i}`] && <FormHelperText error>{errors[`frequency_${i}`]}</FormHelperText>}
          </Box>

          {/* Timing */}
          <Box mb={1.5}>
            <Typography fontSize="14px" mb={0.5}>Timing</Typography>
            <TextField
              value={sub.timing}
              onChange={(e) => updateSub(i, "timing", e.target.value)}
              placeholder={TIMING_PLACEHOLDER}
              size="small"
              sx={{ width: fieldWidth }}
              inputProps={{ style: { fontSize: "14px" } }}
            />
          </Box>

          {/* Phases */}
          <Box mb={1}>
            <Typography fontSize="14px" mb={0.25}>
              Select Phase(s)<span style={{ color: "#D32F2F" }}>*</span>
            </Typography>
            {errors[`phases_${i}`] && (
              <FormHelperText sx={{ color: "#D32F2F", mt: 0, mb: 0.5 }}>
                {errors[`phases_${i}`]}
              </FormHelperText>
            )}
            <FormControl error={!!errors[`phases_${i}`]}>
              <FormGroup>
                {PHASE_ORDER.map((phase) => (
                  <FormControlLabel
                    key={phase}
                    control={
                      <Checkbox
                        size="small"
                        checked={sub.phases.includes(phase)}
                        onChange={() => togglePhase(i, phase)}
                      />
                    }
                    label={<Typography fontSize="14px">{phase}</Typography>}
                  />
                ))}
              </FormGroup>
            </FormControl>
          </Box>

          {i < form.submissions.length - 1 && <Divider sx={{ mt: 2, mb: 2 }} />}
        </Box>
      ))}

      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={addSubmission}
        sx={{ mb: embedded ? 0 : 3 }}
      >
        Add Submission Requirement
      </Button>

      {/* Standalone mode buttons */}
      {!embedded && (
        <Box display="flex" justifyContent="flex-end" gap={1.5} mt={3}>
          <Button variant="outlined" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Report"}
          </Button>
        </Box>
      )}
    </Box>
  );
});

export default AddReportForm;
