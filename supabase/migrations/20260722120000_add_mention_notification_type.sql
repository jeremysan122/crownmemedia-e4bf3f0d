-- Fix: publishing a post that tags another user failed with
-- `invalid input value for enum notification_type: "mention"`.
-- The posts_notify_tagged trigger (20260519012059) inserts notifications with
-- type 'mention', but the notification_type enum never gained that value, so
-- the AFTER INSERT trigger aborted the whole publish transaction whenever a
-- post tagged someone. Add the missing enum value in its own migration so it
-- is committed before any function uses it.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'mention';
