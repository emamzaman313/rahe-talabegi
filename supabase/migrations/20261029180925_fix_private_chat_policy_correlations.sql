-- Repair correlated references in the deployed private-chat RLS policies.
-- These policies were observed on the live project and had tautological
-- comparisons that allowed replies to unrelated messages and poll options
-- from another poll. No application rows are modified or removed.
begin;

drop policy if exists hgd_chat_messages_insert on public.chat_messages;
create policy hgd_chat_messages_insert
on public.chat_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and deleted_at is null
  and pinned_at is null
  and pinned_by is null
  and private.hgd_can_send_chat(conversation_id)
  and (
    reply_to is null
    or exists (
      select 1
      from public.chat_messages parent
      where parent.id = chat_messages.reply_to
        and parent.conversation_id = chat_messages.conversation_id
        and parent.deleted_at is null
    )
  )
);

drop policy if exists hgd_chat_poll_votes_insert on public.chat_poll_votes;
create policy hgd_chat_poll_votes_insert
on public.chat_poll_votes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.chat_polls p
    where p.id = chat_poll_votes.poll_id
      and (p.ends_at is null or p.ends_at > now())
      and private.hgd_can_send_chat(p.conversation_id)
  )
  and exists (
    select 1
    from public.chat_poll_options o
    where o.id = chat_poll_votes.option_id
      and o.poll_id = chat_poll_votes.poll_id
  )
);

-- The table constraint already rejects self-blocks. Avoid a same-table
-- subquery in this INSERT policy, which can recurse through the SELECT policy.
drop policy if exists hgd_blocks_insert_own on public.chat_blocks;
create policy hgd_blocks_insert_own
on public.chat_blocks for insert to authenticated
with check (
  blocker_id = (select auth.uid())
  and blocker_id <> blocked_id
);

commit;
