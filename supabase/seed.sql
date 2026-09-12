-- ============================================================================
-- Demo data for DRL Lending Cooperative.
-- Optional. Run AFTER 0001_init.sql, in the Supabase SQL Editor.
-- Everything goes through create_loan / record_payment, so the seeded books are
-- produced by exactly the same logic the app uses.
--
-- To wipe the demo data later:
--   truncate payment_audit, payments, write_offs, loans, members cascade;
-- ============================================================================

do $$
declare
  first_names text[] := array['Juan', 'Pedro', 'Mario', 'Ramon', 'Danilo', 'Ricardo', 'Eduardo',
    'Rogelio', 'Alfredo', 'Ernesto', 'Rolando', 'Arnel', 'Jomar', 'Michael', 'Joselito',
    'Bernardo', 'Nestor', 'Wilfredo', 'Dominador', 'Reynaldo', 'Maricel', 'Jocelyn', 'Analyn',
    'Rosalinda', 'Marilou', 'Girlie', 'Nenita', 'Corazon', 'Evangeline', 'Josephine'];
  last_names text[] := array['Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza',
    'Torres', 'Tolentino', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Flores', 'Rivera',
    'Domingo', 'Delos Reyes', 'Navarro', 'Pascual', 'Gutierrez', 'Alvarez', 'Salazar'];
  todas text[] := array['Bagumbayan TODA', 'San Roque TODA', 'Poblacion TODA', 'Malanday TODA',
    'Sto. Nino TODA', 'Riverside TODA', 'Bayanihan TODA', 'Maligaya TODA', 'Pag-asa TODA'];
  streets text[] := array['Purok 1, Brgy. San Roque', 'Purok 3, Brgy. Poblacion',
    'Sitio Maligaya, Brgy. Bagumbayan', 'Blk 4 Lot 12, Brgy. Malanday',
    'Riverside St., Brgy. Sto. Nino', 'Mabini St., Brgy. Pag-asa'];
  collaterals text[] := array['Tricycle OR/CR', 'Motorcycle OR/CR', 'Sidecar unit',
    'Franchise certificate', 'ATM card', 'Cellphone'];

  v_member_id uuid;
  v_loan_id uuid;
  v_name text;
  v_principal numeric;
  v_start date;
  v_term integer;
  v_daily numeric;
  v_balance numeric;
  v_days_elapsed integer;
  v_reliability numeric;
  v_pay numeric;
  v_profile integer;
  v_loans_for_member integer;
  i integer;
  j integer;
  d integer;
begin
  for i in 1..150 loop
    v_name := first_names[1 + floor(random() * array_length(first_names, 1))::int]
              || ' ' ||
              last_names[1 + floor(random() * array_length(last_names, 1))::int];

    insert into members (name, contact_number, address, toda, collateral, spouse_name,
                         referred_by, vehicle_number, created_at)
    values (
      v_name,
      '09' || lpad(floor(random() * 1000000000)::text, 9, '0'),
      streets[1 + floor(random() * array_length(streets, 1))::int],
      todas[1 + floor(random() * array_length(todas, 1))::int],
      collaterals[1 + floor(random() * array_length(collaterals, 1))::int],
      case when random() < 0.75
           then first_names[1 + floor(random() * array_length(first_names, 1))::int] || ' '
                || split_part(v_name, ' ', 2)
           else null end,
      case when random() < 0.6
           then last_names[1 + floor(random() * array_length(last_names, 1))::int] || ' (member)'
           else 'Walk-in' end,
      'TRC-' || lpad(floor(random() * 9999)::text, 4, '0'),
      now() - (floor(random() * 330) || ' days')::interval
    )
    returning id into v_member_id;

    -- a third of members are repeat borrowers with two loans
    v_loans_for_member := 1 + (random() < 0.33)::int;

    for j in 1..v_loans_for_member loop
      -- payment behaviour profile: 1 good, 2 slow, 3 defaulted
      v_profile := case
        when random() < 0.62 then 1
        when random() < 0.88 then 2
        else 3
      end;

      v_principal := (floor(random() * 18) + 3) * 500;   -- 1,500 to 10,000
      v_term := case when random() < 0.85 then 40 else (array[30, 50, 60])[1 + floor(random() * 3)::int] end;

      -- defaulted loans start far enough back to be past maturity and flaggable
      v_start := case v_profile
        when 3 then public.biz_today() - (100 + floor(random() * 60))::int
        else public.biz_today() - (floor(random() * 95) + 3)::int
      end;

      v_loan_id := public.create_loan(v_member_id, v_principal, v_term, v_start);

      v_reliability := case v_profile
        when 1 then 0.93 + random() * 0.07
        when 2 then 0.55 + random() * 0.25
        else 0.10 + random() * 0.20
      end;

      v_daily := round((v_principal + v_principal * 0.20) / v_term, 2);
      v_days_elapsed := least(v_term, (public.biz_today() - v_start)::int);

      for d in 1..greatest(v_days_elapsed, 0) loop
        -- did the borrower show up that day?
        if random() <= v_reliability then
          select l.principal + l.interest_amount + l.penalty_amount
                 - coalesce((select sum(amount) from payments where loan_id = v_loan_id), 0)
          into v_balance
          from loans l where l.id = v_loan_id;

          exit when v_balance <= 0;

          -- occasionally they pay short, occasionally they pay a bit extra
          v_pay := case
            when random() < 0.12 then round(v_daily * (0.3 + random() * 0.5), 2)
            when random() < 0.06 then round(v_daily * 2, 2)
            else v_daily
          end;

          v_pay := least(v_pay, v_balance);
          if v_pay > 0 then
            perform public.record_payment(v_loan_id, v_pay, v_start + d, null);
          end if;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

-- Apply overdue penalties and flag write-off candidates on the seeded book.
select public.run_maintenance();

-- Confirm a couple of write-offs so net income differs from gross income.
do $$
declare
  r record;
begin
  for r in
    select loan_id from write_offs where status = 'flagged' order by balance_at_flag desc limit 3
  loop
    perform public.confirm_write_off(r.loan_id, 'Borrower could not be located (demo data)');
  end loop;
end;
$$;

select 'members' as table_name, count(*) from members
union all select 'loans', count(*) from loans
union all select 'payments', count(*) from payments
union all select 'flagged write-offs', count(*) from write_offs where status = 'flagged';
