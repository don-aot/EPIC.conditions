import React, { memo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  IconButton,
  Typography,
  Modal,
  Paper,
  Divider,
  DialogActions
} from "@mui/material";
import ConditionAttributeTable from './Independent/ConditionAttributeTable';
import ManagementPlanSection from './ManagementPlan/ManagementPlanSection';
import { ConditionModel } from "@/models/Condition";
import CloseIcon from '@mui/icons-material/Close';
import LoadingButton from "../../Shared/Buttons/LoadingButton";
import { useRemoveConditionAttributes } from "@/hooks/api/useConditionAttribute";
import { notify } from "@/components/Shared/Snackbar/snackbarStore";
import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEY } from "@/hooks/api/constants";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";

type ConditionAttributeProps = {
    condition: ConditionModel;
    setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
};

const ConditionAttribute = memo(({
    condition,
    setCondition,
  }: ConditionAttributeProps) => {
    const queryClient = useQueryClient();
    const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
    const [requiresPlan, setRequiresPlan] = useState<boolean>(
        condition.requires_management_plan || false);
    const [modalOpen, setModalOpen] = useState(false);
    const [pendingRequiresPlan, setPendingRequiresPlan] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);

    const onRemoveFailure = () => {
        notify.error("Failed to remove condition attributes");
    };

    const onRemoveSuccess = () => {
        notify.success("Condition attributes removed successfully");
    };

    const { mutateAsync: removeConditionAttributes } = useRemoveConditionAttributes(
        condition?.condition_id,
        {
          onSuccess: onRemoveSuccess,
          onError: onRemoveFailure,
        }
    );

    const handleDeleteConditionAttribute = async (newRequiresPlan: boolean) => {
        const hasAttributes =
        (condition.condition_attributes?.independent_attributes?.length ?? 0) > 0 ||
        (condition.condition_attributes?.management_plans?.length ?? 0) > 0;

        if (!hasAttributes) {
            return;
        }

        setLoading(true);

        try {
            const response = await removeConditionAttributes(newRequiresPlan);
            if (response) {
                setCondition((prevCondition) => ({
                    ...prevCondition,
                    condition_attributes: {
                      independent_attributes: [],
                      management_plans: []
                    },
                }));
            }
        } catch (error) {
            notify.error("Failed to remove condition attributes");
        } finally {
          setLoading(false); // Stop loading once the request is complete
        }
    }

    return (
        <>
            <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
                <Paper
                    sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "90%",
                    maxWidth: "500px",
                    borderRadius: "4px",
                    outline: "none",
                    }}
                >
                    <Box
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        padding="14px"
                    >
                    <Typography variant="h6">
                        Discard changes?
                    </Typography>
                    <IconButton onClick={() => setModalOpen(false)}>
                        <CloseIcon />
                    </IconButton>
                    </Box>
                    <Divider />
                    <Box
                        component="div"
                        padding={"14px"}
                        sx={{
                            color: "#CE3E39",
                            fontSize: "14px"
                        }}
                        dangerouslySetInnerHTML={{
                            __html: `
                              You will lose all attribute data and changes made to this condition.<br/>
                              <br/>Are you sure you wish to proceed?
                            `,
                        }}
                    />
                    <DialogActions>
                    <Button onClick={() => setModalOpen(false)} color="secondary">
                        Cancel
                    </Button>
                    <LoadingButton
                        onClick={() => {
                            handleDeleteConditionAttribute(pendingRequiresPlan || false);
                            if (pendingRequiresPlan !== null) {
                                setRequiresPlan(pendingRequiresPlan);
                                setPendingRequiresPlan(null);
                            }
                            setModalOpen(false);
                        }}
                        color="primary"
                        loading={loading}
                    >
                        Confirm
                    </LoadingButton>
                    </DialogActions>
                </Paper>
            </Modal>

            <Box>
                <FormControl component="fieldset" sx={{ mb: 2 }}>
                    <FormLabel component="legend">
                        Does this condition require one or more Management Plan(s)?
                    </FormLabel>
                    <RadioGroup
                        row
                        value={requiresPlan ? "true" : "false"}
                        onChange={(e) => {
                            const newValue = e.target.value === "true";
                            if (newValue !== requiresPlan) {
                                setPendingRequiresPlan(newValue);
                                setModalOpen(true);

                                queryClient.invalidateQueries({
                                    queryKey: ["conditions", condition?.condition_id],
                                    exact: false,
                                });
                                queryClient.invalidateQueries({
                                    queryKey: [QUERY_KEY.CONDITIONSDETAIL],
                                });
                            }
                        }}
                    >
                        {(() => {
                            const plans = condition?.condition_attributes?.management_plans || [];
                            const isDisabled = !canManage
                                || (condition?.is_condition_attributes_approved || false)
                                || (plans.length > 1 && plans.some(p => p.is_approved));
                            return (
                                <>
                                    <FormControlLabel
                                        value="true"
                                        control={<Radio />}
                                        label="Yes"
                                        disabled={isDisabled}
                                    />
                                    <FormControlLabel
                                        value="false"
                                        control={<Radio />}
                                        label="No"
                                        disabled={isDisabled}
                                    />
                                </>
                            );
                        })()}
                    </RadioGroup>
                </FormControl>

                {requiresPlan === true && (
                    <ManagementPlanSection
                        condition={condition}
                        setCondition={setCondition}
                    />
                )}
                {requiresPlan === false && (
                    <ConditionAttributeTable
                        condition={condition}
                        setCondition={setCondition}
                    />
                )}
            </Box>
        </>
    );
});

export default ConditionAttribute;
