import { useState } from "react";

export interface DeliveryInfo {
  bookingId: string;
  forkliftId: string;
  forkliftName: string;
  startDate: string;
  endDate: string;
  customerAddress: string | null;
}

export interface QuoteConversion {
  quoteId: string;
  recurring: boolean;
  replacementCustomerId: string | null;
}

export function useQuoteConversionState() {
  const [pendingDeliveries, setPendingDeliveries] = useState<DeliveryInfo[]>([]);
  const [currentDeliveryIndex, setCurrentDeliveryIndex] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [pendingConversion, setPendingConversion] = useState<QuoteConversion | null>(null);

  return {
    pendingDeliveries, setPendingDeliveries,
    currentDeliveryIndex, setCurrentDeliveryIndex,
    isConverting, setIsConverting,
    showConvertDialog, setShowConvertDialog,
    showAssignmentDialog, setShowAssignmentDialog,
    pendingConversion, setPendingConversion,
  };
}
