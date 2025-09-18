-- Execute in PostgreSQL
CREATE OR REPLACE FUNCTION notify_shares() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('shares_channel', NEW.address);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shares_notify_trigger
AFTER INSERT ON shares
FOR EACH ROW EXECUTE FUNCTION notify_shares();

CREATE OR REPLACE FUNCTION notify_balances() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('balances_channel', NEW.address);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER balances_notify_trigger
AFTER INSERT ON balances
FOR EACH ROW EXECUTE FUNCTION notify_balances();

CREATE OR REPLACE FUNCTION notify_blocks() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('blocks_channel', NEW.miner_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blocks_notify_trigger
AFTER INSERT ON blocks
FOR EACH ROW EXECUTE FUNCTION notify_blocks();