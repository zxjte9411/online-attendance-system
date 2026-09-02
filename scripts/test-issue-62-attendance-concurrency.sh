#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER="supabase_db_online-attendance-system"
USER_ID="00000000-0000-0000-0000-000000000062"
ASSIGNMENT_ID="00000000-0000-0000-0000-000000000162"
POLICY_ID="00000000-0000-0000-0000-000000000262"
TMP_DIR="/tmp/issue-62-attendance-concurrency.$$"
A_LOG="${TMP_DIR}/a.log"
B_LOG="${TMP_DIR}/b.log"
C_LOG="${TMP_DIR}/c.log"
A_PID=""
B_PID=""
C_PID=""

psql_admin() {
  docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

cleanup() {
  set +e

  for pid in "${A_PID}" "${B_PID}" "${C_PID}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null
    fi
  done
  for pid in "${A_PID}" "${B_PID}" "${C_PID}"; do
    if [[ -n "${pid}" ]]; then
      wait "${pid}" 2>/dev/null
    fi
  done

  psql_admin -c "
    delete from public.attendance_records where user_id = '${USER_ID}';
    delete from public.work_policies where id = '${POLICY_ID}';
    delete from public.work_assignments where id = '${ASSIGNMENT_ID}';
    delete from public.profiles where id = '${USER_ID}';
    delete from auth.users where id = '${USER_ID}';
  " >/dev/null 2>&1
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

mkdir "${TMP_DIR}"

echo "=== Issue #62 attendance concurrency test ==="
WORK_DATE="$(psql_admin -At -c "select (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date")"

psql_admin <<SQL
begin;
delete from public.attendance_records where user_id = '${USER_ID}';
delete from public.work_policies where id = '${POLICY_ID}';
delete from public.work_assignments where id = '${ASSIGNMENT_ID}';
delete from public.profiles where id = '${USER_ID}';
delete from auth.users where id = '${USER_ID}';
insert into auth.users (id, email)
values ('${USER_ID}', 'issue62-concurrency@example.test');
insert into public.profiles (id, display_name)
values ('${USER_ID}', 'Issue 62 Concurrency');
insert into public.work_assignments (
  id, user_id, staffing_employer, client_company, project, effective_from
)
values (
  '${ASSIGNMENT_ID}', '${USER_ID}', 'Issue 62 Staffing', 'Issue 62 Client',
  'Issue 62 Project', '${WORK_DATE}'
);
insert into public.work_policies (
  id, user_id, assignment_id, name, standard_start_time, work_minutes,
  fixed_break_minutes, early_arrival_policy, clock_in_rounding_mode,
  clock_out_rounding_mode, working_days, effective_from, timezone
)
values (
  '${POLICY_ID}', '${USER_ID}', '${ASSIGNMENT_ID}', 'Issue 62 Policy', '09:00',
  480, 60, 'STANDARD_START', 'NONE', 'NONE',
  array['0', '1', '2', '3', '4', '5', '6'], '${WORK_DATE}', 'Asia/Taipei'
);
commit;
SQL

docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >"${A_LOG}" 2>&1 <<SQL &
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${USER_ID}';
select public.clock_in_today();
select pg_catalog.pg_advisory_lock(62, 1);
select pg_catalog.pg_sleep(3);
select pg_catalog.pg_advisory_unlock(62, 1);
commit;
SQL
A_PID=$!

psql_admin <<'SQL'
do $$
begin
  for attempt in 1..100 loop
    if exists (
      select 1
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and classid = 62
        and objid = 1
        and granted
    ) then
      return;
    end if;
    perform pg_catalog.pg_sleep(0.1);
  end loop;
  raise exception 'Issue 62 barrier was not acquired';
end;
$$;
SQL

docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >"${B_LOG}" 2>&1 <<SQL &
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${USER_ID}';
set local lock_timeout = '500ms';
create temp table issue_62_lock_result (state text) on commit drop;
do \$do\$
begin
  begin
    perform public.update_work_assignment(
      '${ASSIGNMENT_ID}', 'Changed Staffing', 'Issue 62 Client',
      'Issue 62 Project', '${WORK_DATE}', null
    );
    insert into issue_62_lock_result values ('UNEXPECTED_SUCCESS');
  exception when lock_not_available then
    insert into issue_62_lock_result values (sqlstate);
  end;
end;
\$do\$;
select state from issue_62_lock_result;
rollback;
SQL
B_PID=$!

docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >"${C_LOG}" 2>&1 <<SQL &
begin;
set local role authenticated;
set local request.jwt.claim.sub = '${USER_ID}';
set local lock_timeout = '500ms';
create temp table issue_62_lock_result (state text) on commit drop;
do \$do\$
begin
  begin
    perform public.update_work_policy(
      '${POLICY_ID}', 'Issue 62 Policy', '09:00', 481, 60,
      'STANDARD_START', 'NONE', null, 'NONE', null,
      array['0', '1', '2', '3', '4', '5', '6'], '${WORK_DATE}', null,
      'Asia/Taipei'
    );
    insert into issue_62_lock_result values ('UNEXPECTED_SUCCESS');
  exception when lock_not_available then
    insert into issue_62_lock_result values (sqlstate);
  end;
end;
\$do\$;
select state from issue_62_lock_result;
rollback;
SQL
C_PID=$!

B_STATUS=0
C_STATUS=0
wait "${B_PID}" || B_STATUS=$?
wait "${C_PID}" || C_STATUS=$?
B_OUTPUT="$(<"${B_LOG}")"
C_OUTPUT="$(<"${C_LOG}")"

if [[ "${B_STATUS}" -ne 0 || "${C_STATUS}" -ne 0 || "${B_OUTPUT}" != *55P03* || "${C_OUTPUT}" != *55P03* ]]; then
  echo "Assignment update result:"
  printf '%s\n' "${B_OUTPUT}"
  echo "Policy update result:"
  printf '%s\n' "${C_OUTPUT}"
  exit 1
fi

A_STATUS=0
wait "${A_PID}" || A_STATUS=$?
if [[ "${A_STATUS}" -ne 0 ]]; then
  echo "Attendance transaction failed:"
  printf '%s\n' "$(<"${A_LOG}")"
  exit 1
fi

FINAL_RESULT="$(psql_admin -At -c "
  select concat_ws('|',
    (select count(*)::text from public.attendance_records where user_id = '${USER_ID}'),
    (select count(*)::text from public.attendance_records
     where user_id = '${USER_ID}' and work_date = '${WORK_DATE}'),
    (select staffing_employer from public.work_assignments where id = '${ASSIGNMENT_ID}'),
    (select client_company from public.work_assignments where id = '${ASSIGNMENT_ID}'),
    (select project from public.work_assignments where id = '${ASSIGNMENT_ID}'),
    (select assignment_snapshot->>'staffing_employer' from public.attendance_records where user_id = '${USER_ID}'),
    (select policy_snapshot->>'work_minutes' from public.attendance_records where user_id = '${USER_ID}'),
    (select assignment_snapshot->>'client_company' from public.attendance_records where user_id = '${USER_ID}'),
    (select assignment_snapshot->>'project' from public.attendance_records where user_id = '${USER_ID}'),
    (select name from public.work_policies where id = '${POLICY_ID}'),
    (select work_minutes::text from public.work_policies where id = '${POLICY_ID}'),
    (select policy_snapshot->>'name' from public.attendance_records where user_id = '${USER_ID}')
  );
")"
EXPECTED_RESULT="1|1|Issue 62 Staffing|Issue 62 Client|Issue 62 Project|Issue 62 Staffing|480|Issue 62 Client|Issue 62 Project|Issue 62 Policy|480|Issue 62 Policy"

if [[ "${FINAL_RESULT}" != "${EXPECTED_RESULT}" ]]; then
  echo "Final attendance/snapshot result: ${FINAL_RESULT}"
  echo "Expected: ${EXPECTED_RESULT}"
  exit 1
fi

echo "Assignment update SQLSTATE: 55P03"
echo "Policy update SQLSTATE: 55P03"
echo "Final attendance/snapshot result: ${FINAL_RESULT}"
echo "=== Issue #62 attendance concurrency test passed ==="
