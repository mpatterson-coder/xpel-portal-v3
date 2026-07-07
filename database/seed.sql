-- =============================================================================
-- XPEL Dealership Portal V3 — Seed Data
-- Catalog modeled on real XPEL dealer menus (FUSION / PRIME / WPF DLR menus).
-- Run AFTER schema.sql. Prices are pilot placeholders — set real numbers
-- in-app via Admin -> Catalog & Pricing.
-- =============================================================================

insert into dealership_groups (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Penske Automotive Group'),
  ('22222222-2222-2222-2222-222222222222', 'Lithia Motors')
on conflict (id) do nothing;

insert into dealerships (id, group_id, name, city, state) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Penske Toyota Scottsdale', 'Scottsdale', 'AZ'),
  ('a1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Penske BMW of South Bay', 'Torrance', 'CA'),
  ('a2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Lithia Honda Medford', 'Medford', 'OR'),
  ('a2222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Lithia Ford Boise', 'Boise', 'ID')
on conflict (id) do nothing;

-- Paint Protection Film — ULTIMATE PLUS (clear, self-healing, 10-yr warranty)
insert into products (sku, name, category, tier, description, unit_price, cost) values
  ('PPF-UP-PF', 'ULTIMATE PLUS — Partial Front', 'Paint Protection Film', 'Ultimate Plus',
   'Leading edge of hood & fenders, painted front bumper, backs of painted mirrors', 799.00, 320.00),
  ('PPF-UP-FF', 'ULTIMATE PLUS — Full Front', 'Paint Protection Film', 'Ultimate Plus',
   'Entire hood & fenders, painted front bumper, backs of painted mirrors', 1899.00, 780.00),
  ('PPF-UP-FB', 'ULTIMATE PLUS — Full Body', 'Paint Protection Film', 'Ultimate Plus',
   'All painted surfaces — protects factory paint from stone chips, nicks, and scratches', 5995.00, 2500.00),
-- STEALTH (satin, self-healing)
  ('PPF-ST-FF', 'STEALTH — Full Front', 'Paint Protection Film', 'Stealth',
   'Satin-finish full front: hood, fenders, bumper, mirrors', 2099.00, 880.00),
  ('PPF-ST-FB', 'STEALTH — Full Body', 'Paint Protection Film', 'Stealth',
   'Satin-finish coverage of all painted surfaces', 6995.00, 2950.00),
-- FUSION PLUS ceramic coating (Classic 4yr / Premium 8yr per dealer menu)
  ('CER-FP-CLS', 'FUSION PLUS Ceramic — Classic (4 yr)', 'Ceramic Coating', 'Fusion Plus',
   'Professionally applied ceramic coating; bonds to paint & XPEL film; 4-year warranty', 899.00, 260.00),
  ('CER-FP-PRM', 'FUSION PLUS Ceramic — Premium (8 yr)', 'Ceramic Coating', 'Fusion Plus',
   'Professionally applied ceramic coating; 8-year warranty', 1399.00, 380.00),
-- Window film — PRIME XR / XR PLUS (two fronts / full vehicle per menu)
  ('WF-XR-2F',  'PRIME XR — Two Front Windows', 'Window Film', 'Prime XR',
   'Nano-ceramic film, up to 85% IR heat rejection', 249.00, 90.00),
  ('WF-XR-FV',  'PRIME XR — Full Vehicle', 'Window Film', 'Prime XR',
   'Nano-ceramic film, full vehicle', 649.00, 230.00),
  ('WF-XRP-2F', 'PRIME XR PLUS — Two Front Windows', 'Window Film', 'Prime XR Plus',
   'Multilayer nano-ceramic, 96% IR heat rejection', 349.00, 125.00),
  ('WF-XRP-FV', 'PRIME XR PLUS — Full Vehicle', 'Window Film', 'Prime XR Plus',
   'Multilayer nano-ceramic, full vehicle', 899.00, 320.00),
-- Windshield protection film
  ('WPF-STD', 'Windshield Protection Film', 'Windshield Protection', 'WPF',
   'Nearly invisible film with exceptional impact resistance; guards against chips, cracks, pitting', 999.00, 380.00)
on conflict (sku) do nothing;

-- Example private negotiated price (Penske Full Body)
insert into group_pricing (group_id, product_id, unit_price)
select '11111111-1111-1111-1111-111111111111', p.id, 5495.00
from products p where p.sku = 'PPF-UP-FB'
on conflict (group_id, product_id) do nothing;
