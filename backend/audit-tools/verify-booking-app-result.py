"""Verify and export the one-hotel, one-night Booking app API experiment.

Consumes actual saved responses; never generates substitute prices or meal plans.
Only native Booking blocks are normalized. TPI supplier blocks are counted but
kept separate because their room and price semantics need independent validation.
"""
import argparse
import hashlib
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_hotel(path, hotel_id, check_in, check_out):
    raw = path.read_bytes()
    parsed = json.loads(raw)
    require(isinstance(parsed, list), f'{path.name}: expected hotel array')
    matching = [h for h in parsed if isinstance(h, dict) and str(h.get('hotel_id')) == hotel_id]
    require(len(matching) == 1, f'{path.name}: hotel identity mismatch')
    hotel = matching[0]
    require(hotel.get('arrival_date') == check_in and hotel.get('departure_date') == check_out,
            f'{path.name}: dates mismatch')
    require(hotel.get('currency_code') == 'SAR', f'{path.name}: currency mismatch')
    distribution = hotel.get('min_room_distribution', {})
    require(int(distribution.get('adults', -1)) == 2 and distribution.get('children') == [],
            f'{path.name}: occupancy mismatch')
    return hotel, hashlib.sha256(raw).hexdigest()


def verify(directory, hotel_id, check_in, check_out):
    require((datetime.fromisoformat(check_out) - datetime.fromisoformat(check_in)).days == 1,
            'This diagnostic verifies exactly one night')
    requests = json.loads((directory / 'probe-result.json').read_text(encoding='utf-8'))
    for endpoint in ['mobile.hotelPage', 'mobile.roomList']:
        row = next(r for r in requests['requests'] if r['endpoint'] == endpoint)
        require(row.get('httpStatus') == 200, f'{endpoint}: HTTP failure')
        require(str(row['query'].get('hotel_id')) == hotel_id, f'{endpoint}: request hotel mismatch')
        require(row['query'].get('rec_room_qty') == '1', f'{endpoint}: request room count mismatch')
        require(row['query'].get('rec_guest_qty') == '2', f'{endpoint}: request adults mismatch')
    page, page_hash = read_hotel(directory / 'mobile-apps.booking.com-mobile.hotelPage.body',
                                 hotel_id, check_in, check_out)
    rooms, rooms_hash = read_hotel(directory / 'mobile-apps.booking.com-mobile.roomList.body',
                                   hotel_id, check_in, check_out)
    blocks = rooms.get('block', [])
    require(len(blocks) == int(rooms.get('total_blocks', -1)), 'Native block list is incomplete')
    require(bool(blocks), 'No native offers were returned')
    source_rooms = rooms.get('rooms', {})
    normalized = []
    tax_checks = []
    page_blocks = {b['block_id']: b for b in page.get('block', [])}
    seen = set()
    for block in blocks:
        block_id = block.get('block_id')
        require(block_id and block_id not in seen, 'Missing or duplicate block identity')
        seen.add(block_id)
        require(int(block.get('nr_adults', -1)) == 2 and int(block.get('nr_children', -1)) == 0,
                f'{block_id}: offer occupancy mismatch')
        fit = block.get('fit_occupancy', {})
        require(int(block.get('is_block_fit', 0)) == 1 and int(fit.get('nr_adults', -1)) == 2
                and fit.get('children_ages') == [], f'{block_id}: offer does not fit requested guests')
        price_data = block.get('min_price', {})
        require(price_data.get('currency') == 'SAR', f'{block_id}: offer currency mismatch')
        price = Decimal(str(price_data.get('price')))
        require(price.is_finite() and price > 0, f'{block_id}: invalid price')
        room_id = str(block.get('room_id'))
        require(room_id in source_rooms, f'{block_id}: missing room details')
        meal_flags = ['breakfast_included', 'half_board', 'full_board', 'all_inclusive']
        require(all(k in block for k in meal_flags), f'{block_id}: meal information incomplete')
        plan = ('allInclusive' if block['all_inclusive'] else 'fullBoard' if block['full_board']
                else 'halfBoard' if block['half_board'] else 'breakfast' if block['breakfast_included']
                else 'roomOnly')
        refundable = block.get('refundable')
        require(refundable in [0, 1], f'{block_id}: cancellation flag missing')
        tax_check = None
        if block_id in page_blocks:
            page_price = page_blocks[block_id]['min_price']
            base = Decimal(str(page_price['price']))
            charges = page_price.get('extra_charges_breakdown', {}).get('extra_charge', [])
            excluded = Decimal('0')
            for charge in charges:
                require(charge.get('currency') == 'SAR', 'Tax currency mismatch')
                if int(charge.get('excluded', 0)) == 1:
                    excluded += Decimal(str(charge['amount']))
            require(base + excluded == price, f'{block_id}: tax/display price reconciliation failed')
            tax_check = {'blockId': block_id, 'sourceBasePrice': str(base),
                         'sourceExcludedCharges': str(excluded), 'displayPrice': str(price),
                         'exactMatch': True}
            tax_checks.append(tax_check)
        normalized.append({
            'source': 'Booking Android app API', 'hotelId': hotel_id,
            'roomId': room_id, 'blockId': block_id,
            'roomName': block.get('room_name') or block.get('name_without_policy'),
            'bedConfigurations': source_rooms[room_id].get('bed_configurations', []),
            'checkIn': check_in, 'checkOut': check_out, 'roomsRequested': 1,
            'adults': 2, 'children': 0, 'currency': 'SAR',
            'displayPrice': str(price), 'priceField': 'mobile.roomList.block.min_price.price',
            'mealPlan': plan, 'mealLabelFromSource': block.get('mealplan'),
            'refundable': bool(refundable), 'refundableUntil': block.get('refundable_until') or None,
            'cancellationPolicy': rooms.get('cancellation_policies', {}).get(block_id),
            'taxReconciliationVerified': tax_check is not None,
        })
    require(bool(tax_checks), 'No price could be reconciled against hotel-page taxes')
    result = {
        'testedAtUtc': requests['testedAtUtc'], 'hotelId': hotel_id,
        'hotelName': page['hotel_name'], 'checkIn': check_in, 'checkOut': check_out,
        'rooms': 1, 'adults': 2, 'children': 0, 'currency': 'SAR',
        'nativeOfferCount': len(normalized),
        'roomTypeCount': len({b['roomId'] for b in normalized}),
        'tpiSupplierOffersExcluded': len(rooms.get('tpi_block', [])),
        'checks': {'hotelIdentity': True, 'dates': True, 'oneNight': True,
                   'occupancy': True, 'currency': True, 'nativeOfferListComplete': True,
                   'sampleTaxesReconciled': True, 'windowsWithoutAndroidRuntime': True},
        'taxReconciliations': tax_checks,
        'rawResponseSha256': {'hotelPage': page_hash, 'roomList': rooms_hash},
        'offers': normalized,
        'productionIntegrationVerified': False,
        'limitations': ['One hotel and one night tested', 'No Genius account used',
                        'No visual comparison with the running Android app',
                        'Synthetic diagnostic client profile', 'No Dokploy test or integration',
                        'One TPI offer excluded pending separate supplier validation'],
    }
    (directory / 'verified-offers.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    requests['hotelIdVerified'] = True
    requests['priceScrapingVerified'] = True
    requests['verificationFile'] = 'verified-offers.json'
    (directory / 'probe-result.json').write_text(json.dumps(requests, indent=2), encoding='utf-8')
    print(json.dumps({k: result[k] for k in ['hotelName', 'checkIn', 'checkOut', 'nativeOfferCount', 'roomTypeCount', 'checks']}))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='outputs/booking-app-probe/almarwa-detail')
    parser.add_argument('--hotel-id', default='184752')
    parser.add_argument('--check-in', default='2026-10-20')
    parser.add_argument('--check-out', default='2026-10-21')
    args = parser.parse_args()
    verify(Path(args.directory), args.hotel_id, args.check_in, args.check_out)
