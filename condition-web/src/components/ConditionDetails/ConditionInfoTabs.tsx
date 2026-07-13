import React, { useState } from 'react';
import { Box, Button, CircularProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import { styled } from '@mui/system';
import { BCDesignTokens } from 'epic.theme';
import ConditionAttribute from './ConditionAttribute';
import ConditionDescription from './ConditionDescription';
import { ConditionModel } from "@/models/Condition";
import { useHasAllowedRoles, KeycloakRoles } from "@/hooks/useAuthorization";

const StyledTabs = styled(Tabs)({
    transition: 'none',
    minHeight: 0,
    '& .MuiTabs-indicator': {
        display: 'none',
    },
});

const StyledTab = styled(Tab)(({ theme }) => ({
    height: '31px',
    minHeight: 0,
    color: theme.palette.text.primary,
    fontWeight: 400,
    backgroundColor: '#EDEBE9',
    marginRight: '4px',
    borderTopLeftRadius: '4px',
    borderTopRightRadius: '4px',
    border: '1px solid #D6D6D6',

    '&.Mui-selected': {
        color: '#313132',
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #D6D6D6',
        borderLeft: '1px solid #D6D6D6',
        borderRight: '1px solid #D6D6D6',
        borderBottom: 'none',
        fontWeight: 700,
    },
}));

const EditButton = styled(Button)({
    height: '32px',
    width: '280px',
    borderRadius: "4px 4px 0 0",
    marginLeft: 'auto',
    border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`,
    backgroundColor: BCDesignTokens.surfaceColorBackgroundLightGray,
    color: 'black',
    '&:hover': {
        backgroundColor: BCDesignTokens.surfaceColorBorderDefault,
    },
});

const ConditionInfoTabs: React.FC<{
    projectId: string,
    documentId: string,
    conditionId: number
    condition: ConditionModel;
    setCondition: React.Dispatch<React.SetStateAction<ConditionModel>>;
}> = ({ projectId, documentId, conditionId, condition, setCondition }) => {
    const canManage = useHasAllowedRoles([KeycloakRoles.MANAGE_CONDITIONS]);
    const [selectedTab, setSelectedTab] = useState('requirements');
    const [editMode, setEditMode] = useState(false);
    const [isConditionApproved, setIsConditionApproved] = useState(condition.is_approved || false);
    const [isLoading, setIsLoading] = useState(false);

    const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
        setSelectedTab(newValue);
    };

    const handleEditClick = () => {
        if (editMode) {
            // Only show loading when saving (edit → view transition)
            setIsLoading(true);
        }
        setEditMode((prev) => !prev);
    };

    return (
        <>
            <Stack
                direction="row"
                alignItems="flex-end"
                sx={{ position: 'relative', zIndex: 1 }}
            >
                <StyledTabs value={selectedTab} onChange={handleTabChange} aria-label="Condition details tabs">
                    <StyledTab label="Condition Requirements" value="requirements" />
                    <StyledTab label="Condition Attributes" value="attributes" />
                </StyledTabs>

                {/* Conditionally render the Edit button only if the "requirements" tab is selected */}
                {canManage && selectedTab === 'requirements' && !isConditionApproved && (
                    <EditButton
                        variant="contained"
                        size="small"
                        onClick={handleEditClick}
                        disabled={isLoading}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            whiteSpace: 'nowrap',
                            position: 'relative',
                        }}
                    >
                        {isLoading ? (
                            <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                        ) : (
                            <>
                                {editMode ? (
                                    <Typography component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                                        <SaveAltIcon
                                            sx={{ color: "#255A90", mr: 0.5 }}
                                            fontSize="small"
                                        />
                                        <Box
                                            component="span"
                                            sx={{ ml: 0.5, color: "#255A90", fontWeight: "bold" }}
                                        >
                                            Save Condition Requirements
                                        </Box>
                                    </Typography>
                                ) : (
                                    <Typography component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                                        <EditIcon
                                            sx={{ color: "#255A90", mr: 0.5 }}
                                            fontSize="small"
                                        />
                                        <Box
                                            component="span"
                                            sx={{ ml: 0.5, color: "#255A90", fontWeight: "bold" }}
                                        >
                                            Edit Condition Requirements
                                        </Box>
                                    </Typography>
                                )}
                            </>
                        )}
                    </EditButton>
                )}
            </Stack>
            <Box sx={{ border: '1px solid #D6D6D6', borderRadius: '0 4px 4px 4px', mt: '-1px', position: 'relative', zIndex: 0 }}>
                <Box sx={{ border: `1px solid ${BCDesignTokens.surfaceColorBorderDefault}`, borderRadius: '4px', m: '15px 18px 25px 18px', p: 2 }}>
                    <Box sx={{ display: selectedTab === 'requirements' ? 'block' : 'none' }}>
                        <ConditionDescription
                            editMode={editMode}
                            projectId={projectId}
                            documentId={documentId}
                            conditionId={conditionId}
                            condition={condition}
                            isConditionApproved={isConditionApproved}
                            setIsConditionApproved={setIsConditionApproved}
                            setCondition={setCondition}
                            setIsLoading={setIsLoading}
                        />
                    </Box>
                    <Box sx={{ display: selectedTab === 'attributes' ? 'block' : 'none' }}>
                        <ConditionAttribute
                            condition={condition}
                            setCondition={setCondition}
                        />
                    </Box>
                </Box>
            </Box>
        </>
    );
};

export default ConditionInfoTabs;
