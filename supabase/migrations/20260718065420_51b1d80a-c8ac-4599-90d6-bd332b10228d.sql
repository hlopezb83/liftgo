UPDATE public.prospects SET created_by = NULL WHERE created_by = '3e2d6f9d-aa74-4a70-b1d2-0c11a1cd1019';
DELETE FROM auth.users WHERE id = '3e2d6f9d-aa74-4a70-b1d2-0c11a1cd1019';