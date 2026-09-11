import { useEffect, useState } from "react";
import { Box, Button, Grid, Stack, Typography, TextField } from "@mui/material";
import EditIcon from '@mui/icons-material/Edit';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import DocumentStatusChip from "../Projects/DocumentStatusChip";
import { ConditionModel, ConditionType } from "@/models/Condition";
import { BCDesignTokens } from "epic.theme";
import { StyledLabel } from "../Shared/Table/common";
import { useUpdateConditionDetails } from "@/hooks/api/useConditions";
import { useGetReports } from "@/hooks/api/useReport";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { PartialUpdateTopicTagsModel } from "@/models/Condition";
import ChipInput from "../Shared/Chips/ChipInput";
import { HTTP_STATUS_CODES, QUERY_KEY } from "../../hooks/api/constants";
import { useQueryClient } from "@tanstack/react-query";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";

type ConditionHeaderProps = {
    conditionId: number;
    projectName: string;
    documentLabel: string;
    condition: ConditionModel;
    setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
};

const ConditionHeader = ({
    conditionId,
    projectName,
    documentLabel,
    condition,
    setCondition
}: ConditionHeaderProps) => {
    const queryClient = useQueryClient();
    const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
    const [editConditionMode, setEditConditionMode] = useState(false);
    const [conditionNumber, setConditionNumber] = useState(condition?.condition_number || "");
    const [conditionName, setConditionName] = useState(condition?.condition_name || "");
    const [conditionConflictError, setConditionConflictError] = useState(false);
    const [approvalError, setApprovalError] = useState(false);
    const [approvalErrorMessage, setApprovalErrorMessage] = useState("");

    const [editMode, setEditMode] = useState(false);
    const [tags, setTags] = useState<string[]>(condition?.topic_tags || []);

    const onCreateFailure = () => {
      notify.error("Failed to save condition");
    };

    const onCreateSuccess = () => {
        notify.success("Condition saved successfully");
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEY.CONDITIONSDETAIL],
        });
    };

    const isAmendCondition = condition.condition_type === ConditionType.AMEND;

    const { data: reports = [] } = useGetReports(condition.condition_id);
    const isConditionAttributesApproved =
        (condition.condition_attributes?.management_plans ?? []).every((plan) => plan.is_approved)
        && (condition.condition_attributes?.iem_terms ?? []).every((terms) => terms.is_approved)
        && reports
            .flatMap((report) => report.submissions ?? [])
            .every((submission) => submission.is_approved);

    const { data: conditionDetails, mutateAsync: updateConditionDetails } = useUpdateConditionDetails(
        true,
        isAmendCondition,
        conditionId,
        {
          onSuccess: onCreateSuccess,
          onError: onCreateFailure,
        }
    );
  
    const handleEditClick = () => {
      setEditMode(!editMode);
      setConditionConflictError(false);
      setApprovalError(false);
      setApprovalErrorMessage('');
    };

    const handleEditToggle = () => {
      setConditionConflictError(false);
      setApprovalError(false);
      setApprovalErrorMessage('');
      setEditConditionMode((prev) => !prev);
    };

    const handleSave = async () => {
        if (!conditionNumber) {
          notify.error("Condition number is required.");
          return;
        }

        if (!conditionName?.trim()) {
          notify.error("Condition name is required.");
          return;
        }

        const data: PartialUpdateTopicTagsModel = {};

        if (Number(conditionNumber) !== Number(condition.condition_number)) {
            if (isAmendCondition) {
              setConditionConflictError(true);
              return;
            }
            data.condition_number = conditionNumber ? Number(conditionNumber) : condition.condition_number;
        }

        if (conditionName !== condition.condition_name) {
          data.condition_name = conditionName ? conditionName : condition.condition_name;
        }

        if (Object.keys(data).length > 0) {
          try {
            await updateConditionDetails(data);
            setEditConditionMode(false);
            setConditionConflictError(false);
            setApprovalErrorMessage('');
            setApprovalError(false);
          } catch (error) {
            if ((
              error as {
                response?: { data?: { message?: string }; status?: number }
              }).response?.status === HTTP_STATUS_CODES.CONFLICT
            ) {
              setConditionConflictError(true);
            } else {
              notify.error("Failed to save condition.");
            }
          }
        } else {
          setEditConditionMode(false);
          setConditionConflictError(false);
        }
    };

    useEffect(() => {
        if (conditionDetails) {
            setCondition((prevCondition) => ({
                ...prevCondition,
                ...conditionDetails,
                subconditions: prevCondition.subconditions,
            }));
        }
    }, [conditionDetails, setCondition]);

    const approveTags = (isApprovalAction = true) => {
        // Check if conditionName or conditionNumber is empty
        if (!condition.condition_name) {
          setApprovalError(true)
          setApprovalErrorMessage("Please enter a Condition Name.");
          return;
        }

        if (!condition.condition_number) {
          setApprovalError(true)
          setApprovalErrorMessage("Please enter a Condition Number.");
          return;
        }

        // Prepare the data for update
        const data: PartialUpdateTopicTagsModel = isApprovalAction
          ? { is_topic_tags_approved: !condition.is_topic_tags_approved }
          : { topic_tags: tags };
      
        updateConditionDetails(data);
    };

    const calculateWidth = (text: string) => {
      const baseWidth = 10;
      return `${Math.max(baseWidth * text.length, 50)}px`;
    };

    return (
      <>
        <Grid
          container
          direction={{ xs: "column", sm: "row" }}
          paddingBottom={condition.is_topic_tags_approved ? 1 : 5}
        >
          <Grid item xs={10} sx={{ padding: { xs: "10px", sm: "10px 10px 0px 10px" } }}>
            <Stack direction={"column"}>
              {editConditionMode ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    marginBottom: "-22px"
                  }}
                >
                  <TextField
                    variant="outlined"
                    value={conditionNumber}
                    onChange={(e) => {
                      setConditionNumber(e.target.value);
                      setConditionConflictError(false);
                    }}
                    sx={{
                      width: calculateWidth(String(conditionNumber)),
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "4px 0 0 4px",
                      },
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderRadius: "4px 0 0 4px",
                      },
                    }}
                  />
                  <TextField 
                    variant="outlined" 
                    fullWidth
                    value={conditionName}
                    onChange={(e) => setConditionName(e.target.value)}
                    sx={{
                      width: calculateWidth(conditionName),
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "0px",
                      },
                      "& .MuiOutlinedInput-notchedOutline": {
                        borderRadius: "0px",
                      },
                    }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleSave}
                    sx={{
                      alignSelf: "stretch",
                      borderRadius: "0 4px 4px 0",
                      border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                      backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
                      height: '100%',
                      padding: '5px 0',
                      display: 'flex',
                      alignItems: 'center',
                      color: "black",
                      '&:hover': {
                        backgroundColor: BCDesignTokens.surfaceColorBorderDefault,
                      },
                    }}
                  >
                    <Typography component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                      <SaveAltIcon sx={{ color: "#255A90", mr: 1, ml: 1 }} fontSize="small" />
                      <Box component="span" sx={{ mr:2, color: "#255A90", fontWeight: "bold" }}>
                        Save
                      </Box>
                    </Typography>
                  </Button>
                </Box>
              ) : (
                <>
                  <Stack direction="row">
                    <Box
                      sx={{
                        border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                        borderRadius: "4px 0 0 4px",
                        borderRight: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        padding: '1px 10px 0 10px',
                        backgroundColor: condition.is_topic_tags_approved ? '#F7F9FC' : 'inherit',
                      }}
                    >
                      {condition.condition_name ? (
                        <Typography variant="h6">
                          {conditionNumber ? `${conditionNumber}.` : conditionNumber} {conditionName}
                        </Typography>
                      ) : (
                        <Box display="flex" alignItems="center" width="100%" height="37px">
                          <Typography variant="h6" sx={{ paddingRight: '15px' }}>
                            {conditionNumber ? `${conditionNumber}.` : conditionNumber}
                          </Typography>
                          <TextField
                            variant="outlined"
                            fullWidth
                            value={conditionName}
                            onChange={(e) => canManage && setConditionName(e.target.value)}
                            placeholder="Enter condition name"
                            disabled={!canManage}
                            size="small"
                            sx={{
                              "& .MuiOutlinedInput-root": {
                                height: "45px",
                                marginTop: "22px",
                                borderRadius: 0,
                                borderLeft: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                                borderTop: "none",
                                borderRight: "none",
                                borderBottom: "none",
                                "&:hover": {
                                  borderLeft: `1px solid`,
                                },
                                "&.Mui-focused": {
                                  borderLeft: `1px solid`,
                                },
                              },
                              "& .MuiOutlinedInput-notchedOutline": {
                                border: "none", // remove default MUI border
                              },
                            }}
                          />
                        </Box>
                      )}
                    </Box>
                    {canManage && !condition.is_topic_tags_approved && !condition.condition_name && (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleSave}
                        sx={{
                          alignSelf: "stretch",
                          borderRadius: "0 4px 4px 0",
                          border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                          backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
                          height: '100%',
                          padding: '5px 0',
                          display: 'flex',
                          alignItems: 'center',
                          color: "black",
                          '&:hover': {
                            backgroundColor: BCDesignTokens.surfaceColorBorderDefault,
                          },
                        }}
                      >
                        <Typography component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                          <SaveAltIcon sx={{ color: "#255A90", mr: 0.5 }} fontSize="small" />
                          <Box component="span" sx={{ mr: 1, color: "#255A90", fontWeight: "bold" }}>
                            Save
                          </Box>
                        </Typography>
                      </Button>
                    )}
                    {canManage && !condition.is_topic_tags_approved && condition.condition_name && (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleEditToggle}
                        sx={{
                          alignSelf: "stretch",
                          borderRadius: "0 4px 4px 0",
                          border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                          backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
                          height: '100%',
                          padding: '2.25px 0',
                          display: 'flex',
                          alignItems: 'center',
                          color: "black",
                          '&:hover': {
                            backgroundColor: BCDesignTokens.surfaceColorBorderDefault,
                          },
                        }}
                      >
                        <Typography component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                          <EditIcon sx={{ color: "#255A90", mr: 0.5 }} fontSize="small" />
                          <Box component="span" sx={{ mr: 1, color: "#255A90", fontWeight: "bold" }}>
                            Edit
                          </Box>
                        </Typography>
                      </Button>
                    )}
                  </Stack>
                </>
              )}
              {conditionConflictError && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    marginBottom: "15px",
                    color: "#CE3E39",
                    marginTop: 1,
                    fontSize: "14px",
                  }}
                >
                  {isAmendCondition
                    ? "The condition number cannot be changed because this condition is amending an existing condition."
                    : "This condition number already exists. Please enter a new one."}
                </Box>
              )}
              {((!conditionName && canManage) || approvalError) && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    marginBottom: "15px",
                    color: "#CE3E39",
                    marginTop: 1,
                    fontSize: "14px",
                  }}
                >
                  {approvalError ? approvalErrorMessage : "Please enter a Condition Name."}
                </Box>
              )}
            </Stack>
          </Grid>
          <Grid
            item
            xs={2}
            sx={{
              padding: { xs: "10px", sm: "10px 10px 0px 10px" },
              display: 'flex',
              justifyContent: 'flex-end'
            }}
          >
            <DocumentStatusChip
              status={
                condition?.is_approved
                && isConditionAttributesApproved
                && condition?.is_topic_tags_approved
                  ? "true"
                  : "false"
              }
            />
          </Grid>
        </Grid>
        <Grid container direction={{ xs: "column", sm: "row" }}>
          <Grid item xs={6} sx={{ padding: { xs: "10px", sm: "10px 5px 10px 10px" } }}>
            <Box
              sx={{
                border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                borderRadius: "4px",
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
              }}
            >
              <Grid container direction={{ xs: "column", sm: "row" }}>
                <Grid item xs={8} sx={{ pl: 2, pt: 2 }}>
                  <Stack 
                      direction="row" 
                      alignItems="center" // Aligns items in a visually consistent way
                      gap={4.5} // Controls spacing dynamically
                  >
                      <StyledLabel sx={{ whiteSpace: "nowrap" }}>
                          Project:
                      </StyledLabel>
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                          {projectName}
                      </Typography>
                  </Stack>
                </Grid>
                <Grid item xs={4} sx={{ pl: 2, pt: 2 }}>
                  <Stack 
                      direction="row" 
                      alignItems="center" // Aligns items in a visually consistent way
                      gap={1.5} // Controls spacing dynamically
                  >
                      <StyledLabel sx={{ whiteSpace: "nowrap" }}>
                        Year Condition Issued:
                      </StyledLabel>
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                          {condition?.year_issued}
                      </Typography>
                  </Stack>
                </Grid>
              </Grid>
              <Grid container direction={{ xs: "column", sm: "row" }}>
                <Grid item xs={12} sm={8} sx={{ pl: 2, pb: 2, pt: 1 }}>
                  <Stack 
                      direction="row" 
                      alignItems="center" // Aligns items in a visually consistent way
                      gap={1.5} // Controls spacing dynamically
                  >
                      <StyledLabel sx={{ whiteSpace: "nowrap" }}>
                        Document:
                      </StyledLabel>
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                          {documentLabel}
                      </Typography>
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          </Grid>

          <Grid item xs={6} sx={{ padding: { xs: "10px", sm: "10px 10px 10px 5px" }, position: 'relative' }}>
            <Box
              sx={{
                border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                borderRadius: "4px",
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                backgroundColor: condition.is_topic_tags_approved ? '#F7F9FC' : 'inherit'
              }}
            >
              <Grid container direction="row">
                <Grid item xs={12} sx={{ pl: 2, pt: 2 }}>
                  <Stack direction="row" alignItems="flex-start" gap={1.5}>
                    <StyledLabel sx={{ whiteSpace: "nowrap" }}>
                      Tags:
                    </StyledLabel>
                    <Typography variant="body2"  sx={{ whiteSpace: "nowrap", pt: .5 }} component="span">
                      {editMode ? (
                        <ChipInput
                          chips={tags}
                          setChips={setTags}
                          placeholder="Add tag"
                          inputWidth="100%"
                        />
                      ) : (
                        <>{tags?.join(', ')}</>
                      )}
                    </Typography>
                  </Stack>
                </Grid>
              </Grid>
            </Box>

            {canManage && !condition.is_topic_tags_approved && (
              <Button
                variant="contained"
                size="small"
                onClick={handleEditClick}
                sx={{
                  position: 'absolute', // Position it absolutely
                  top: -21,
                  right: 10,
                  borderRadius: "4px 4px 0 0",
                  border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
                  backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
                  color: "black",
                  '&:hover': {
                    backgroundColor: BCDesignTokens.surfaceColorBorderDefault,
                  },
                }}
              > 
                {editMode ? (
                  <Typography
                    component="span"
                    sx={{ display: 'inline-flex', alignItems: 'center' }}
                    onClick={() => approveTags(false)}
                  >
                    <SaveAltIcon sx={{ color: "#255A90", mr: 0.5 }} fontSize="small" />
                    <Box component="span" sx={{ ml: 0.5, color: "#255A90", fontWeight: "bold" }}>
                      Save Tags
                    </Box>
                  </Typography>
                ) : (
                  <Typography component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                    <EditIcon sx={{ color: "#255A90", mr: 0.5 }} fontSize="small" />
                    <Box component="span" sx={{ ml: 0.5, color: "#255A90", fontWeight: "bold" }}>
                      Edit/Add Tags
                    </Box>
                  </Typography>
                )}
              </Button>
            )}
          </Grid>

          <Grid
            item
            xs={12}
            display="flex"
            justifyContent="flex-end"
            alignItems="flex-end"
            paddingRight={1}
            paddingBottom={1}
          >
            <Stack direction="row" spacing={1}>
                {canManage && !editMode &&
                    <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        disabled={editConditionMode}
                        sx={{ padding: "4px 8px", borderRadius: "4px" }}
                        onClick={() => approveTags(true)}
                    >
                        {condition.is_topic_tags_approved ? 'Un-confirm Condition Information' : 'Confirm Condition Information'}
                    </Button>
                }
            </Stack>
          </Grid>
        </Grid>
      </>
    );
};

export default ConditionHeader;
