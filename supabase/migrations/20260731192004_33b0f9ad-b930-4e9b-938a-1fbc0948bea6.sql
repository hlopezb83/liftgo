UPDATE public.bank_accounts ba
   SET account_holder = cs.razon_social,
       updated_at = now()
  FROM public.company_settings cs
 WHERE ba.account_holder IS NULL
   AND cs.razon_social IS NOT NULL;