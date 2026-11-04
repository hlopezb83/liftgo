-- Reduced synthetic fixtures, seeded BEFORE 0107. No operational data.
INSERT INTO organizations VALUES
 ('12320000-0000-4000-8000-000000000001','Synthetic A','synthetic-a'),
 ('12320000-0000-4000-8000-000000000002','Synthetic B','synthetic-b');
INSERT INTO customers VALUES
 ('12320000-0000-4000-8000-000000000003','Synthetic customer A','12320000-0000-4000-8000-000000000001'),
 ('12320000-0000-4000-8000-000000000004','Synthetic customer B','12320000-0000-4000-8000-000000000002');
INSERT INTO auth.users VALUES
 ('12320000-0000-4000-8000-000000000005','admin-a@synthetic.invalid'),
 ('12320000-0000-4000-8000-000000000006','admin-b@synthetic.invalid'),
 ('12320000-0000-4000-8000-000000000007','sales@synthetic.invalid');
INSERT INTO user_roles VALUES
 ('12320000-0000-4000-8000-000000000005','admin'),
 ('12320000-0000-4000-8000-000000000006','admin'),
 ('12320000-0000-4000-8000-000000000007','ventas');
INSERT INTO organization_memberships VALUES
 ('12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000005','internal'),
 ('12320000-0000-4000-8000-000000000002','12320000-0000-4000-8000-000000000006','internal'),
 ('12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000007','internal');
INSERT INTO quotes(id,organization_id,customer_id,quote_number,start_date,end_date,line_items,currency)
SELECT ('12320000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003','SYN-Q-'||n,
 current_date,current_date+30,
 jsonb_build_array(jsonb_build_object('quote_line_id',('12320000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,
  'line_kind',CASE WHEN n=12 THEN 'rental' ELSE 'charge' END,'description','Synthetic source',
  'quantity',3,'unit_price',100,'total',300)),'MXN'
FROM generate_series(10,15) AS n;
INSERT INTO bookings(id,organization_id,customer_id,quote_id,booking_number,status,recurring_billing,start_date,end_date)
SELECT ('12320000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,
 '12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003',
 ('12320000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'SYN-B-'||n,'confirmed',true,current_date,current_date+30
FROM generate_series(10,15) AS n;
INSERT INTO invoices(id,organization_id,customer_id,invoice_number,quote_id,booking_id,line_items,subtotal,total,status,moneda) VALUES
 ('12320000-0000-4000-8000-000000000030','12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003','SYN-LEGACY-30','12320000-0000-4000-8000-000000000010','12320000-0000-4000-8000-000000000020',
  '[{"description":"Synthetic historic delivery","quantity":1,"unit_price":100,"total":100}]',100,100,'draft','MXN'),
 ('12320000-0000-4000-8000-000000000031','12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003','SYN-MULTI-31',NULL,NULL,
  '[{"description":"Synthetic multi extra one","quantity":1,"unit_price":100,"total":100},{"description":"Synthetic multi extra two","quantity":1,"unit_price":100,"total":100}]',200,200,'draft','MXN'),
 ('12320000-0000-4000-8000-000000000032','12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003','SYN-NO-CHARGE-32','12320000-0000-4000-8000-000000000012','12320000-0000-4000-8000-000000000022',
  '[{"description":"Synthetic manual rent","quantity":1,"unit_price":100,"total":100}]',100,100,'draft','MXN'),
 ('12320000-0000-4000-8000-000000000033','12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003','SYN-MIXED-33','12320000-0000-4000-8000-000000000014','12320000-0000-4000-8000-000000000024',
  '[{"description":"Synthetic native","line_kind":"charge","source_quote_id":"12320000-0000-4000-8000-000000000014","source_quote_line_id":"12320000-0000-4000-8000-000000000114","quantity":1,"unit_price":100,"total":100},{"description":"Synthetic ambiguous extra","quantity":1,"unit_price":100,"total":100}]',200,200,'draft','MXN'),
 ('12320000-0000-4000-8000-000000000034','12320000-0000-4000-8000-000000000001','12320000-0000-4000-8000-000000000003','SYN-EMPTY-34','12320000-0000-4000-8000-000000000015','12320000-0000-4000-8000-000000000025','[]',100,100,'draft','MXN');
INSERT INTO invoice_bookings(invoice_id,booking_id,organization_id) VALUES
 ('12320000-0000-4000-8000-000000000031','12320000-0000-4000-8000-000000000021','12320000-0000-4000-8000-000000000001'),
 ('12320000-0000-4000-8000-000000000031','12320000-0000-4000-8000-000000000023','12320000-0000-4000-8000-000000000001');
