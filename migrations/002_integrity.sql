CREATE OR REPLACE FUNCTION enforce_plan_limits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE lim int; cnt int; BEGIN
PERFORM pg_advisory_xact_lock(hashtext(NEW.clinic_id||'plan'));
IF TG_TABLE_NAME='doctors' THEN SELECT p.max_doctors INTO lim FROM clinic_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.clinic_id=NEW.clinic_id; SELECT count(*) INTO cnt FROM doctors WHERE clinic_id=NEW.clinic_id;
ELSE SELECT p.max_users INTO lim FROM clinic_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.clinic_id=NEW.clinic_id; SELECT (SELECT count(*) FROM clinic_memberships WHERE clinic_id=NEW.clinic_id)+(SELECT count(*) FROM invitations WHERE clinic_id=NEW.clinic_id AND expires_at>now()) INTO cnt; END IF;
IF lim IS NOT NULL AND cnt>=lim THEN RAISE EXCEPTION 'PLAN_LIMIT'; END IF; RETURN NEW; END $$;
CREATE TRIGGER doctor_limits BEFORE INSERT ON doctors FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();
CREATE TRIGGER membership_limits BEFORE INSERT ON clinic_memberships FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();
CREATE TRIGGER invitation_limits BEFORE INSERT ON invitations FOR EACH ROW EXECUTE FUNCTION enforce_plan_limits();
CREATE OR REPLACE FUNCTION enforce_payment_amount() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE total int; paid bigint; returned bigint; BEGIN
PERFORM pg_advisory_xact_lock(hashtext(NEW.clinic_id||NEW.invoice_id));
SELECT total_minor INTO total FROM invoices WHERE id=NEW.invoice_id AND clinic_id=NEW.clinic_id;
SELECT coalesce(sum(amount_minor),0) INTO paid FROM payments WHERE invoice_id=NEW.invoice_id AND clinic_id=NEW.clinic_id;
SELECT coalesce(sum(r.amount_minor),0) INTO returned FROM refunds r JOIN payments p ON p.id=r.payment_id AND p.clinic_id=r.clinic_id WHERE p.invoice_id=NEW.invoice_id AND r.clinic_id=NEW.clinic_id;
IF total IS NULL OR NEW.amount_minor>total-paid+returned THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF; RETURN NEW; END $$;
CREATE TRIGGER payment_amount BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION enforce_payment_amount();
CREATE OR REPLACE FUNCTION enforce_refund_amount() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE total int; returned bigint; BEGIN
PERFORM pg_advisory_xact_lock(hashtext(NEW.clinic_id||NEW.payment_id));
SELECT amount_minor INTO total FROM payments WHERE id=NEW.payment_id AND clinic_id=NEW.clinic_id;
SELECT coalesce(sum(amount_minor),0) INTO returned FROM refunds WHERE payment_id=NEW.payment_id AND clinic_id=NEW.clinic_id;
IF total IS NULL OR NEW.amount_minor>total-returned THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF; RETURN NEW; END $$;
CREATE TRIGGER refund_amount BEFORE INSERT ON refunds FOR EACH ROW EXECUTE FUNCTION enforce_refund_amount();
