-- A bank account may be removed only while it has no statement history.
-- The original CASCADE relations could silently delete imports, reconciled
-- statement lines and in-progress uploads when the account was deleted.
ALTER TABLE public.bank_statement_imports
  DROP CONSTRAINT bank_statement_imports_bank_account_id_fkey;
ALTER TABLE public.bank_statement_imports
  ADD CONSTRAINT bank_statement_imports_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.bank_statement_lines
  DROP CONSTRAINT bank_statement_lines_bank_account_id_fkey;
ALTER TABLE public.bank_statement_lines
  ADD CONSTRAINT bank_statement_lines_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.bank_statement_uploads
  DROP CONSTRAINT bank_statement_uploads_bank_account_id_fkey;
ALTER TABLE public.bank_statement_uploads
  ADD CONSTRAINT bank_statement_uploads_bank_account_id_fkey
  FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id) ON DELETE RESTRICT;
