import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recurringChargeAmounts, recurringQuoteCharges } from '../../supabase/functions/generate-recurring-invoices/quoteCharges.ts';
const quote='10700000-0000-4000-8000-000000000001';
const source='10700000-0000-4000-8000-000000000002';
function payload(overrides={}, quoteOverrides={}) {
  return {complete:true,quotes:[{quote_id:quote,legacy_review_required:false,lines:[{
    quote_line_id:source,quoted_quantity:3,consumed_quantity:1,remaining_quantity:2,
    line:{quote_line_id:source,line_kind:'charge',description:'Entrega',quantity:3,unit_price:100},
    ...overrides,
  }],...quoteOverrides}]};
}
test('partial availability creates only remaining source quantity',()=>{
  const [line]=recurringQuoteCharges(payload(),[quote]);
  assert.equal(line.quantity,2); assert.equal(line.total,200);
  assert.equal(line.source_quote_id,quote); assert.equal(line.source_quote_line_id,source);
});
test('fully consumed source never repeats on later recurring periods',()=>{
  assert.deepEqual(recurringQuoteCharges(payload({consumed_quantity:3,remaining_quantity:0}),[quote]),[]);
});
test('unknown legacy history fails closed',()=>{
  assert.throws(()=>recurringQuoteCharges(payload({}, {legacy_review_required:true}),[quote]),/históricos/);
});
test('incomplete, missing, duplicate and malformed responses fail closed',()=>{
  for (const value of [null,{}, {complete:false,quotes:[]},{complete:true,quotes:[]},
    payload({remaining_quantity:3}),payload({consumed_quantity:-1}),payload({quote_line_id:'bad'}),
    {...payload(),quotes:[...payload().quotes,...payload().quotes]},
    payload({}, {legacy_review_required:undefined})]) {
    assert.throws(()=>recurringQuoteCharges(value,[quote]));
  }
});
test('partial fixed discount requires explicit manual review',()=>{
  assert.throws(()=>recurringQuoteCharges(payload({line:{quote_line_id:source,line_kind:'charge',description:'Entrega',quantity:3,unit_price:100,discount:10,discount_type:'$'}}),[quote]),/revisión manual/);
});
test('percentage discounts retain identity and use remaining quantity',()=>{
  const [line]=recurringQuoteCharges(payload({line:{quote_line_id:source,line_kind:'charge',description:'Entrega',quantity:3,unit_price:100,discount:10,discount_type:'%'}}),[quote]);
  assert.equal(line.quantity,2); assert.equal(line.total,200); assert.equal(line.discount,10);
  assert.deepEqual(recurringChargeAmounts(line,16),{netCents:18000,taxCents:2880});
});
test('duplicate source rows cannot double bill a source',()=>{
  const value=payload(); value.quotes[0].lines.push(value.quotes[0].lines[0]);
  assert.throws(()=>recurringQuoteCharges(value,[quote]));
});

test('line-specific exemption and tax rate match persisted invoice semantics',()=>{
  const [line]=recurringQuoteCharges(payload(),[quote]);
  assert.deepEqual(recurringChargeAmounts({...line,objeto_imp:'01'},16),{netCents:20000,taxCents:0});
  assert.deepEqual(recurringChargeAmounts({...line,tax_rate:8},16),{netCents:20000,taxCents:1600});
});

test('source amount is recomputed from unit price with currency-cent rounding',()=>{
  const [line]=recurringQuoteCharges(payload({line:{quote_line_id:source,line_kind:'charge',description:'Entrega',quantity:3,unit_price:1.005,total:999}}),[quote]);
  assert.equal(line.total,2.02);
});
