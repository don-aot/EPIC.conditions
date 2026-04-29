import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  ExtractedCondition,
  ExtractedSubcondition,
  ExtractionRequest
} from "@/hooks/api/useExtractionRequests";

// ---------- Design tokens --------------------------------------------------
const colors = {
  primary: "#003366",
  primaryDark: "#002244",
  primary04: "rgba(0, 51, 102, 0.04)",
  headerBg: "#F7F9FC",
  divider: "#E0E0E0",
  tableHeaderText: "#666",
  conditionNumber: "#003366",
  detailBorder: "#D9E2EC",
  detailText: "#2F3B4A",
  detailIdentifier: "#4B5A6A",
};
// ---------------------------------------------------------------------------

const getRequirementChildren = (item: ExtractedCondition | ExtractedSubcondition) =>
  item.clauses ?? item.subconditions ?? [];

const getRequirementIdentifier = (item: ExtractedSubcondition) =>
  item.subcondition_identifier ?? item.clause_identifier ?? null;

const getRequirementText = (item: ExtractedSubcondition) =>
  item.subcondition_text ?? item.clause_text ?? null;

type ParsedRequirementLine = {
  identifier: string | null;
  text: string;
  level: number;
};

type RequirementLineProps = {
  identifier: string | null;
  text: string;
  level: number;
};

const REQUIREMENT_INDENT_PX = 24;

const requirementLineStyles = {
  display: "grid",
  gridTemplateColumns: "max-content minmax(0, 1fr)",
  columnGap: 0.85,
  alignItems: "start",
} as const;

// These helpers are intentionally local to the preview modal.
// They format extracted requirement text for quick staff review and
// should not be treated as the source of truth for condition structure.
const getRequirementLevel = (identifier: string | null) => {
  if (!identifier) {
    return 0;
  }

  const normalizedIdentifier = identifier.trim();

  if (/^\d+\.\d+(?:\.\d+)*$/.test(normalizedIdentifier)) {
    return 0;
  }

  if (/^[a-z]\)$/i.test(normalizedIdentifier)) {
    return 1;
  }

  if (/^(?:[ivxlcdm]+)\.$/i.test(normalizedIdentifier)) {
    return 2;
  }

  if (/^\d+\)$/.test(normalizedIdentifier) || /^[a-z]\.$/i.test(normalizedIdentifier)) {
    return 2;
  }

  return 0;
};

const parseRequirementText = (text: string): ParsedRequirementLine[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^((?:\d+\.\d+(?:\.\d+)*)|(?:[a-z]\))|(?:[ivxlcdm]+\.)|(?:\d+\))|(?:[a-z]\.))\s+(.*)$/i);
      const identifier = match?.[1] ?? null;
      const parsedText = match?.[2] ?? line;

      return {
        identifier,
        text: parsedText,
        level: getRequirementLevel(identifier),
      };
    });

const RequirementLine: React.FC<RequirementLineProps> = ({
  identifier,
  text,
  level,
}) => (
  <Box
    sx={{
      ...requirementLineStyles,
      pl: `${level * REQUIREMENT_INDENT_PX}px`,
    }}
  >
    <Typography
      variant="body2"
      sx={{
        color: colors.detailIdentifier,
        fontWeight: identifier ? 600 : 400,
        lineHeight: 1.6,
      }}
    >
      {identifier ?? ""}
    </Typography>
    <Typography
      variant="body2"
      sx={{
        color: colors.detailText,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </Typography>
  </Box>
);

// Renders structured nested clauses/subconditions when the extractor payload
// already includes a hierarchy. This is the most faithful preview path.
const RequirementTree: React.FC<{
  items: ExtractedSubcondition[];
  level?: number;
}> = ({ items, level = 0 }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: level === 0 ? 1.5 : 1 }}>
      {items.map((item, index) => {
        const identifier = getRequirementIdentifier(item);
        const text = getRequirementText(item);
        const children = getRequirementChildren(item);
        const key = `${identifier ?? "item"}-${level}-${index}`;

        if (!identifier && !text && children.length === 0) {
          return null;
        }

        return (
          <Box key={key} sx={{ mt: index === 0 ? 0 : 1.25 }}>
            {(identifier || text) && (
              <RequirementLine
                identifier={identifier ?? "•"}
                text={text ?? ""}
                level={level}
              />
            )}
            {children.length > 0 && <RequirementTree items={children} level={level + 1} />}
          </Box>
        );
      })}
    </Box>
  );
};

// Falls back to lightweight line parsing when the preview only has a flattened
// condition_text block. This keeps the preview readable without changing the
// underlying extracted data.
const RequirementTextOutline: React.FC<{
  text: string;
}> = ({ text }) => {
  const lines = parseRequirementText(text);

  if (lines.length <= 1) {
    return (
      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {text}
      </Typography>
    );
  }

  return (
    <Box sx={{ mt: 0.75 }}>
      {lines.map((line, index) => (
        <Box
          key={`${line.identifier ?? "line"}-${index}`}
          sx={{
            mt: index === 0 ? 0 : 1,
          }}
        >
          <RequirementLine
            identifier={line.identifier}
            text={line.text}
            level={line.level}
          />
        </Box>
      ))}
    </Box>
  );
};

const RequirementPreviewContent: React.FC<{
  condition: ExtractedCondition;
}> = ({ condition }) => {
  const structuredItems = getRequirementChildren(condition);

  return (
    <Box>
      {structuredItems.length > 0 ? (
        <Box
          sx={{
            p: 1.5,
            border: `1px solid ${colors.detailBorder}`,
            borderRadius: 1,
            backgroundColor: "#FFFFFF",
          }}
        >
          {condition.condition_text &&
            structuredItems.length === 0 && (
            <Typography
              variant="body2"
              sx={{
                color: colors.detailText,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                mb: 1.5,
              }}
            >
              {condition.condition_text}
            </Typography>
          )}
          <RequirementTree items={structuredItems} />
        </Box>
      ) : (
        condition.condition_text && <RequirementTextOutline text={condition.condition_text} />
      )}
    </Box>
  );
};

export interface ExtractionPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** The request to preview. When null the dialog is mounted but hidden. */
  extractionRequest: ExtractionRequest | null;
  onReject: (id: number) => void;
  onImport: (id: number) => void;
  isImporting: boolean;
  isRejecting: boolean;
}

export const ExtractionPreviewModal: React.FC<ExtractionPreviewModalProps> = ({
  open,
  onClose,
  extractionRequest,
  onReject,
  onImport,
  isImporting,
  isRejecting,
}) => {
  const [showRejectConfirmation, setShowRejectConfirmation] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  useEffect(() => {
    setShowRejectConfirmation(false);
    setExpandedKeys([]);
  }, [extractionRequest?.id, open]);

  // Keep the Dialog mounted so MUI can run open/close animations correctly.
  // We render empty content when there is no request to show.
  const conditions = extractionRequest?.extracted_data?.conditions ?? [];
  const isBusy = isImporting || isRejecting;

  const getConditionKey = (condition: ExtractedCondition, index: number) =>
    String(condition.condition_number ?? condition.condition_name ?? index);

  const hasConditionDetails = (condition: ExtractedCondition) =>
    Boolean(condition.condition_text) || getRequirementChildren(condition).length > 0;

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      {extractionRequest && (
        <>
          <DialogTitle
            sx={{
              backgroundColor: colors.headerBg,
              borderBottom: `1px solid ${colors.divider}`,
              pb: 2,
              pt: 2.5,
            }}
          >
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  Review Extracted Conditions
                </Typography>
                <Typography variant="body2" color="textSecondary" mt={0.5}>
                  {extractionRequest.document_label ?? "Project Schedule B: Table of Conditions"}
                </Typography>
              </Box>
              <IconButton onClick={onClose} size="small" disabled={isBusy} aria-label="Close">
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>

          <DialogContent sx={{ pt: 3, pb: 4 }}>
            <Typography variant="subtitle1" fontWeight="bold" mb={2} mt={1}>
              {conditions.length} Condition{conditions.length !== 1 ? "s" : ""} found
            </Typography>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1, maxHeight: '50vh' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {["", "Condition #", "Condition Name", "Tags"].map((header) => (
                      <TableCell
                        key={header}
                        sx={{ fontWeight: "bold", color: colors.tableHeaderText }}
                      >
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {conditions.map((cond: ExtractedCondition, index: number) => {
                    const conditionKey = getConditionKey(cond, index);
                    const isExpanded = expandedKeys.includes(conditionKey);
                    const showDetails = hasConditionDetails(cond);

                    return (
                      <React.Fragment key={conditionKey}>
                        <TableRow hover>
                          <TableCell sx={{ width: 48 }}>
                            {showDetails && (
                              <IconButton
                                size="small"
                                onClick={() => toggleExpanded(conditionKey)}
                                aria-label={
                                  isExpanded
                                    ? "Hide condition requirement"
                                    : "Show condition requirement"
                                }
                              >
                                {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                              </IconButton>
                            )}
                          </TableCell>
                          <TableCell sx={{ color: colors.conditionNumber, fontWeight: "bold" }}>
                            {cond.condition_number ?? index + 1}
                          </TableCell>
                          <TableCell>{cond.condition_name}</TableCell>
                          <TableCell>
                            <Box display="flex" gap={0.5} flexWrap="wrap">
                              {cond.topic_tags?.map((tag) => (
                                <Chip key={tag} label={tag} size="small" sx={{ backgroundColor: '#E3F2FD', color: colors.primaryDark }} />
                              ))}
                            </Box>
                          </TableCell>
                        </TableRow>
                        {showDetails && (
                          <TableRow>
                            <TableCell colSpan={4} sx={{ py: 0, borderBottom: isExpanded ? undefined : 0 }}>
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box
                                  sx={{
                                    px: 2,
                                    py: 1.5,
                                    backgroundColor: "#FAFBFC",
                                    borderTop: `1px solid ${colors.divider}`,
                                  }}
                                >
                                  <RequirementPreviewContent condition={cond} />
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>

          <DialogActions
            sx={{
              backgroundColor: colors.headerBg,
              borderTop: `1px solid ${colors.divider}`,
              p: 2,
              gap: 1,
              justifyContent: showRejectConfirmation ? "space-between" : "flex-end",
            }}
          >
            {showRejectConfirmation ? (
              <>
                <Box display="flex" alignItems="center" gap={1}>
                  <ErrorOutlineIcon color="error" />
                  <Typography variant="body2" color="error" fontWeight="bold">
                    Are you sure you want to discard this extraction?
                  </Typography>
                </Box>
                <Box display="flex" gap={1}>
                  <Button variant="outlined" onClick={() => setShowRejectConfirmation(false)} disabled={isBusy}>
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => onReject(extractionRequest.id)}
                    disabled={isBusy}
                  >
                    {isRejecting ? "Discarding…" : "Yes, Discard"}
                  </Button>
                </Box>
              </>
            ) : (
              <>
                <Button
                  variant="outlined"
                  onClick={() => setShowRejectConfirmation(true)}
                  disabled={isBusy}
                  sx={{
                    color: colors.primary,
                    borderColor: colors.primary,
                    textTransform: "none",
                    px: 3,
                    fontWeight: "bold",
                    "&:hover": { borderColor: colors.primary, backgroundColor: colors.primary04 },
                  }}
                >
                  Discard Extraction
                </Button>
                <Button
                  variant="contained"
                  onClick={() => onImport(extractionRequest.id)}
                  disabled={isBusy}
                  sx={{
                    backgroundColor: colors.primary,
                    color: "white",
                    textTransform: "none",
                    px: 3,
                    fontWeight: "bold",
                    "&:hover": { backgroundColor: colors.primaryDark },
                  }}
                >
                  {isImporting ? "Importing…" : "Approve & Import"}
                </Button>
              </>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};
