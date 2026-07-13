import React from "react";
import {
  Modal,
  Paper,
  Box,
  Typography,
  IconButton,
  Divider,
  DialogActions,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

type DeleteConfirmationModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onConfirm: () => void;
};

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  open,
  title = "Delete Management Plan",
  description = "By deleting this Management Plan, you will lose all of its associated attributes.<br/><br/>Are you sure you wish to proceed?",
  onClose,
  onConfirm,
}) => {
  return (
    <Modal open={open} onClose={onClose}>
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
          <Typography variant="h6">{title}</Typography>
          <IconButton onClick={onClose}>
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
            dangerouslySetInnerHTML={{ __html: description }}
        />
            <DialogActions>
                <Button color="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button color="primary" onClick={onConfirm}>
                    Confirm
                </Button>
            </DialogActions>
      </Paper>
    </Modal>
  );
};

export default DeleteConfirmationModal;
