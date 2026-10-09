-- Read-only check after « Publier le passage »: posts the publish may have created wrongly.
-- Run on prod:  psql -h localhost -U <user> -d gndj -f deploy/diagnostics/passage-publish-check.sql
-- Every section should be empty. A row = a member to fix by hand on their file (Unités / Fonctions tab).

\echo '== 1. Members with two active youth posts, or a youth post next to a chef post (two chef posts = normal, not listed)'
select m.card_number, m.last_name || ' ' || m.first_name as member,
       string_agg(u.code || ' · ' || r.name || ' (depuis ' || a.start_date || ')', ' | ' order by a.start_date) as active_posts
from member_assignments a
join members m on m.id = a.member_id and not m.is_deleted
join units u on u.id = a.unit_id
join functional_roles r on r.id = a.functional_role_id
where a.end_date is null and not a.is_deleted
group by m.id, m.card_number, m.last_name, m.first_name
having count(*) filter (where not r.is_maitrise) > 1
    or (count(*) filter (where not r.is_maitrise) >= 1 and count(*) filter (where r.is_maitrise) >= 1)
order by 2;

\echo '== 2. Active posts whose team belongs to another unit'
select m.card_number, m.last_name || ' ' || m.first_name as member, u.code as unit, t.name as team, tu.code as team_unit
from member_assignments a
join members m on m.id = a.member_id and not m.is_deleted
join units u on u.id = a.unit_id
join teams t on t.id = a.team_id
join units tu on tu.id = t.unit_id
where a.end_date is null and not a.is_deleted and t.unit_id <> a.unit_id
order by 2;

\echo '== 3. Posts that end before they start'
select m.card_number, m.last_name || ' ' || m.first_name as member, u.code, a.start_date, a.end_date
from member_assignments a
join members m on m.id = a.member_id
join units u on u.id = a.unit_id
where not a.is_deleted and a.end_date is not null and a.end_date < a.start_date
order by 2;

\echo '== 4. Members given a youth post by the passage AND a chef post by the maîtrise plan'
select m.card_number, m.last_name || ' ' || m.first_name as member, l.scout_year
from maitrise_plan_lines l
join members m on m.id = l.member_id
where l.kind = 'Start' and l.applied_at is not null
  and exists (select 1 from member_assignments a join functional_roles r on r.id = a.functional_role_id
              where a.member_id = l.member_id and a.end_date is null and not a.is_deleted and not r.is_maitrise)
order by 2;
