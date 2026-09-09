export const REPORT_TYPES = [
  { value: "Management Plan Associated Report", label: "Management Plan Associated Report" },
  { value: "Compliance Notification", label: "Compliance Notification" },
  { value: "Compliance Self-Report", label: "Compliance Self-Report" },
  { value: "Project Status Notification", label: "Project Status Notification" },
  { value: "Monitoring/Technical Report", label: "Monitoring/Technical Report" },
];

export const REPORT_PHASES = [
  "All Phases",
  "Pre-Construction",
  "Construction",
  "Operations",
  "Closure",
  "Post-Closure",
  "Post-Issuance",
];

export const PHASE_ORDER = REPORT_PHASES;

export const REPORT_FREQUENCIES = [
  { value: "As Needed", label: "As Needed" },
  { value: "One Time", label: "One Time" },
  { value: "Annually", label: "Annually" },
  { value: "Semi-Annually", label: "Semi-Annually" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Monthly", label: "Monthly" },
  { value: "Weekly", label: "Weekly" },
  { value: "Other", label: "Other" },
];

export const PSN_FREQUENCIES = [
  { value: "As Needed", label: "As Needed" },
  { value: "One Time", label: "One Time" },
  { value: "Annually", label: "Annually" },
  { value: "Quarterly", label: "Quarterly" },
];

const PSN_TYPE = "Project Status Notification";
const CN_TYPE = "Compliance Notification";
const CSR_TYPE = "Compliance Self-Report";
const MP_TYPE = "Management Plan Associated Report";
export const MT_TYPE = "Monitoring/Technical Report";

export const getFrequencies = (reportType: string) => {
  if (reportType === PSN_TYPE) return PSN_FREQUENCIES;
  if (reportType === CN_TYPE) return COMPLIANCE_NOTIFICATION_FREQUENCIES;
  if (reportType === CSR_TYPE) return COMPLIANCE_SELF_REPORT_FREQUENCIES;
  if (reportType === MP_TYPE) return MANAGEMENT_PLAN_FREQUENCIES;
  if (reportType === MT_TYPE) return MONITORING_TECHNICAL_FREQUENCIES;
  return REPORT_FREQUENCIES;
};

export const MANAGEMENT_PLAN_FREQUENCIES = [
  { value: "As Needed", label: "As Needed" },
  { value: "One Time", label: "One Time" },
  { value: "Annually", label: "Annually" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Other", label: "Other" },
];

export const COMPLIANCE_SELF_REPORT_FREQUENCIES = [
  { value: "As Needed", label: "As Needed" },
  { value: "One Time", label: "One Time" },
  { value: "Annually", label: "Annually" },
  { value: "Quarterly", label: "Quarterly" },
];

export const MONITORING_TECHNICAL_FREQUENCIES = [
  { value: "As Needed", label: "As Needed" },
  { value: "One Time", label: "One Time" },
  { value: "Annually", label: "Annually" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Other", label: "Other" },
];

export const COMPLIANCE_NOTIFICATION_FREQUENCIES = [
  { value: "As Needed", label: "As Needed" },
  { value: "One Time", label: "One Time" },
  { value: "Annually", label: "Annually" },
  { value: "Quarterly", label: "Quarterly" },
];

export const PSN_SUBMISSION_TYPES = [
  { value: "Primary Contact Notification", label: "Primary Contact Notification" },
  { value: "Phase Status Notification", label: "Phase Status Notification" },
];
