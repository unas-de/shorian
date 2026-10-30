ALTER TABLE cash_sessions ADD COLUMN expected_minor int;
ALTER TABLE cash_sessions ADD COLUMN difference_minor int;
ALTER TABLE cash_sessions ADD COLUMN difference_reason text;
CREATE UNIQUE INDEX one_open_cash_session ON cash_sessions(clinic_id) WHERE closed_at IS NULL;
ALTER TABLE invoices ADD COLUMN discount_minor int NOT NULL DEFAULT 0 CHECK(discount_minor>=0);
ALTER TABLE invoices ADD COLUMN discount_reason text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION apply_invoice_discount(iid text,discount int,reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE base int; paid bigint; refunded bigint; BEGIN
IF app_role()<>'manager' OR reason IS NULL OR length(trim(reason))=0 OR discount<0 THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(current_clinic()||iid));
IF NOT EXISTS(SELECT FROM invoices WHERE id=iid AND clinic_id=current_clinic()) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
SELECT coalesce(sum(amount_minor),0) INTO base FROM invoice_items WHERE invoice_id=iid AND clinic_id=current_clinic();
SELECT coalesce(sum(amount_minor),0) INTO paid FROM payments WHERE invoice_id=iid AND clinic_id=current_clinic();
SELECT coalesce(sum(r.amount_minor),0) INTO refunded FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=iid AND r.clinic_id=current_clinic();
IF discount>base OR base-discount<paid-refunded THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
UPDATE invoices SET total_minor=base-discount,discount_minor=discount,discount_reason=reason WHERE id=iid AND clinic_id=current_clinic();
END $$;
REVOKE ALL ON FUNCTION apply_invoice_discount(text,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_invoice_discount(text,int,text) TO clinic_app;
CREATE OR REPLACE FUNCTION enforce_schedule() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE tz text; slot_start timestamp; slot_end timestamp; BEGIN
IF NEW.status IN('cancelled','no_show','completed','in_progress') THEN RETURN NEW; END IF;
SELECT timezone INTO tz FROM clinics WHERE id=NEW.clinic_id;slot_start=NEW.starts_at AT TIME ZONE tz;slot_end=NEW.ends_at AT TIME ZONE tz;
IF slot_start::date<>slot_end::date OR NOT EXISTS(SELECT FROM doctor_schedules WHERE clinic_id=NEW.clinic_id AND doctor_id=NEW.doctor_id AND weekday=extract(dow FROM slot_start)::int AND slot_start::time>=make_time(start_hour,0,0) AND (end_hour=24 OR slot_end::time<=make_time(end_hour,0,0))) OR EXISTS(SELECT FROM schedule_exceptions WHERE clinic_id=NEW.clinic_id AND doctor_id=NEW.doctor_id AND starts_at<NEW.ends_at AND ends_at>NEW.starts_at) THEN RAISE EXCEPTION 'OUTSIDE_SCHEDULE'; END IF;RETURN NEW;END $$;
CREATE TRIGGER enforce_schedule_trigger BEFORE INSERT OR UPDATE OF starts_at,ends_at,doctor_id ON appointments FOR EACH ROW EXECUTE FUNCTION enforce_schedule();
