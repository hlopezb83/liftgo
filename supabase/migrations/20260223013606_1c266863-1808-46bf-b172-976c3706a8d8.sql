-- Clean up duplicate dispatcher roles for users who are customers
DELETE FROM user_roles
WHERE role = 'dispatcher'
  AND user_id IN (
    SELECT user_id FROM user_roles WHERE role = 'customer'
  );