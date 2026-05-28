-- Make User.phone unique to prevent duplicate user accounts from accumulating
-- during employee imports. Phone is a login identifier so must be unique.
ALTER TABLE "User" ADD CONSTRAINT "User_phone_key" UNIQUE ("phone");
