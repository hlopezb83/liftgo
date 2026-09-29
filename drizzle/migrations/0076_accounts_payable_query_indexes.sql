-- Add query indexes after the organization_id column exists on supplier_bills.
CREATE INDEX IF NOT EXISTS supplier_bills_org_issue_date_id_idx
  ON public.supplier_bills (organization_id, issue_date DESC, id ASC);

CREATE INDEX IF NOT EXISTS supplier_payments_required_rep_bill_status_idx
  ON public.supplier_payments (bill_id, rep_status)
  WHERE rep_required;
