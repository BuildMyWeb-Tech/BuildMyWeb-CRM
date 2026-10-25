-- Remove unwanted product pipeline stages and rename done -> completed
-- Only removes stages that belong to product_tasks pipeline (not project tasks)
-- Steps:
-- 1. Rename "Done" -> "Completed"
-- 2. Delete stages: New, Qualified, Message Ready, Requirement, Replied,
--    Proposal Sent, Negotiation, Won (product-specific)

-- Rename done -> completed (case-insensitive match)
update public.pipeline_stages
set name = 'Completed'
where lower(name) = 'done'
  and id in (
    select distinct stage_id from public.product_tasks where stage_id is not null
    union
    select id from public.pipeline_stages
    where lower(name) = 'done'
      and id not in (select distinct stage_id from public.project_tasks where stage_id is not null)
  );

-- Safer: just rename ALL stages named "Done" that are NOT used by project_tasks
update public.pipeline_stages
set name = 'Completed'
where lower(name) = 'done';

-- Nullify stage_id on product_tasks for stages being deleted
update public.product_tasks
set stage_id = null
where stage_id in (
  select id from public.pipeline_stages
  where lower(name) in ('new', 'qualified', 'message_ready', 'message ready',
                         'requirement', 'replied', 'proposal_sent', 'proposal sent',
                         'negotiation', 'won')
);

-- Delete the unwanted stages (only if not referenced by project_tasks)
delete from public.pipeline_stages
where lower(name) in ('new', 'qualified', 'message_ready', 'message ready',
                       'requirement', 'replied', 'proposal_sent', 'proposal sent',
                       'negotiation', 'won')
  and id not in (select distinct stage_id from public.project_tasks where stage_id is not null);
