#!/usr/bin/env bash
# Applies every migration to a scratch database and runs the SQL tests.
# Needs a superuser connection: DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${DATABASE_URL:?set DATABASE_URL to a superuser connection string}"
DB=inkognito_test
psql "$URL" -q -c "drop database if exists $DB" -c "create database $DB"
TEST_URL="${URL%/*}/$DB"
# harness.sql stands in for the parts of Supabase the migrations rely on (auth schema, roles). It is for tests only.
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f tests/harness.sql
for f in migrations/*.sql; do echo "migrating $f"; psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$TEST_URL" -v ON_ERROR_STOP=1 -f tests/rls.sql 2>&1 | tee /tmp/inkognito-sql-tests.log
for n in "RLS/API" Identity Random Media Admin AI Billing "Admin finance" "Image review" "Direct message" "Adult gate and search" "Resonance and streak" "Image scanning" "Refund" "Push notification"; do grep -q "$n tests passed" /tmp/inkognito-sql-tests.log || { echo "MISSING: $n tests did not pass"; exit 1; }; done
echo "All SQL tests passed"
