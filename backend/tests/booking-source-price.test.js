import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookingRooms } from '../scrapers/booking-client.js';
import { requestOtp, verifyOtp, getBookingSessionData, isBookingSessionActive } from '../scrapers/booking-session-store.js';

test('A local account flag cannot change a source price, tax or invent a Genius discount', () => {
  const amount = value => ({currency:'SAR',value});
  const request = {hotelId:'123',checkIn:'2026-10-11',checkOut:'2026-10-12',roomsInfo:[{adultsCount:2,kidsAges:[]}],geniusActive:true};
  const payload = [{hotel_id:123,arrival_date:request.checkIn,departure_date:request.checkOut,currency_code:'SAR',min_room_distribution:{adults:2,children:[]},total_blocks:1,rooms:{'10':{}},block:[{
    block_id:'quote',room_id:10,room_name:'Standard Twin Room',nr_adults:2,nr_children:0,fit_occupancy:{nr_adults:2,children_ages:[]},is_block_fit:1,min_price:{price:477.39,currency:'SAR'},breakfast_included:0,half_board:0,full_board:0,all_inclusive:0,refundable:0,
    product_price_breakdown:{net_amount:amount(405),all_inclusive_amount:amount(477.39),excluded_amount:amount(72.39),included_taxes_and_charges_amount:amount(0),items:[{kind:'charge',name:'Taxes',item_amount:amount(72.39)}]},
  }]}];
  const quote = Object.values(normalizeBookingRooms(payload,request))[0].offers.roomOnly;
  assert.equal(quote.price,477.39);
  assert.equal(quote.taxBreakdown.priceBeforeTax,405);
  assert.equal(quote.taxBreakdown.taxesAndFees,72.39);
  assert.equal(quote.discountAmount,null);
  assert.deepEqual(quote.discountLabels,[]);
  assert.equal(quote.priceField,'mobile.roomList.block.min_price.price');
  const breakdown = payload[0].block[0].product_price_breakdown;
  breakdown.strikethrough_amount = amount(450);
  breakdown.discounted_amount = amount(45);
  breakdown.items.push({kind:'discount',name:'Genius 10%'});
  const discounted = Object.values(normalizeBookingRooms(payload,request))[0].offers.roomOnly;
  assert.equal(discounted.taxBreakdown.priceBeforeTax,405);
  assert.equal(discounted.price,477.39);
  assert.equal(discounted.discountAmount,45);
  assert.deepEqual(discounted.discountLabels,['Genius 10%']);
});

test('Locally supplied email and OTP never claim a Booking login or Genius level', () => {
  assert.equal(requestOtp('guest@example.test').success,false);
  for(const code of ['123456','ABCDEF'])assert.equal(verifyOtp('guest@example.test',code).success,false);
  assert.equal(isBookingSessionActive(),false);
  assert.equal(getBookingSessionData(),null);
});
