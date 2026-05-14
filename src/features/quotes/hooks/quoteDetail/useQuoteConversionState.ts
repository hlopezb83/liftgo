import { useState } from "react";

export interface DeliveryInfo {
  bookingId: string;
  forkliftId: string;
  forkliftName: string;
  startDate: string;
  customerAddress: string | null;
}

export function useQuoteConversionState() {
  const [pendingDeliveries, setPendingDeliveries] = useState<DeliveryInfo[]>([]);
  const [currentDeliveryIndex, setCurrentDeliveryIndex] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [showCustomerReassignDialog, setShowCustomerReassignDialog] = useState(false);
  const [reassignCustomerId, setReassignCustomerId] = useState("");
  const [reassignCustomerName, setReassignCustomerName] = useState("");
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [pendingRecurring, setPendingRecurring] = useState(false);

  return {
    pendingDeliveries, setPendingDeliveries,
    currentDeliveryIndex, setCurrentDeliveryIndex,
    isConverting, setIsConverting,
    showRecurringDialog, setShowRecurringDialog,
    showCustomerReassignDialog, setShowCustomerReassignDialog,
    reassignCustomerId, setReassignCustomerId,
    reassignCustomerName, setReassignCustomerName,
    showAssignmentDialog, setShowAssignmentDialog,
    pendingRecurring, setPendingRecurring,
  };
}
