import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ui = fs.readFileSync(path.join(root, 'src/public-chat-moderation.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029185329_public_chat_moderation_and_reports_repair.sql'), 'utf8');
const actionsMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029185331_public_chat_moderation_actions_repair.sql'), 'utf8');
const groupCapacityMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029185333_discussion_group_capacity_guard_repair.sql'), 'utf8');
const targetGuardMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029185335_public_chat_moderation_target_guard_repair.sql'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const publicChat = fs.readFileSync(path.join(root, 'src/public-chat.js'), 'utf8');

test('moderation UI has report submission and moderator review actions', () => {
  assert.match(ui, /from\('public_chat_reports'\)\.insert/);
  assert.match(ui, /from\('public_chat_reports'\)\s*\.select/);
  assert.match(ui, /moderator-delete/);
  assert.match(ui, /app_metadata/);
  assert.match(ui, /escapeHtml\(body\)/);
  assert.match(ui, /renderCurrentUserActionNotice/);
  assert.match(ui, /data-hg-pcr-action=\"refresh-user-notice\"/);
  assert.match(ui, /هشدار ۷روزه/);
});

test('moderation policies are RLS-protected and use server-controlled role claims', () => {
  assert.match(migration, /alter table public\.public_chat_reports enable row level security/i);
  assert.match(migration, /create policy public_chat_reports_insert_own[\s\S]*reporter_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /auth\.jwt\(\)->'app_metadata'/i);
  assert.doesNotMatch(migration, /auth\.jwt\(\)->'user_metadata'/i);
  assert.match(migration, /grant update \(deleted_at\) on public\.public_chat_messages/i);
  assert.match(migration, /status = 'open'[\s\S]*moderator_id is null[\s\S]*reviewed_at is null/i);
  assert.match(migration, /m\.sender_id = reported_user_id/i);
  assert.match(migration, /create unique index if not exists public_chat_reports_one_per_user_message_idx/i);
  assert.match(migration, /m\.deleted_at is null/i);
  assert.match(migration, /deleted_at is not null and body = 'این پیام حذف شد\.'/i);
  assert.match(migration, /grant update \(status, moderator_id, moderator_note, reviewed_at\)/i);
});

test('migration is additive and does not bulk-delete app data', () => {
  assert.match(migration, /create table if not exists public\.public_chat_reports/i);
  assert.doesNotMatch(migration, /\b(drop\s+table|truncate\s+table|delete\s+from)\b/i);
  assert.match(migration, /begin;[\s\S]*commit;/i);
});

test('soft delete writes the tombstone body required by the RLS policy', () => {
  assert.match(publicChat, /update\(\{body:\s*['"]این پیام حذف شد\.['"],deleted_at:new Date\(\)\.toISOString\(\)\}\)/);
  assert.match(ui, /update\(\{ body: ['"]این پیام حذف شد\.['"], deleted_at: new Date\(\)\.toISOString\(\) \}\)/);
});

test('the installed app shell loads the moderation module', () => {
  assert.match(html, /src="\.\/src\/public-chat-moderation\.js"/);
});


test('moderation actions are audited and constrained to trusted roles', () => {
  assert.match(ui, /applyUserModeration/);
  assert.match(ui, /mute-60/);
  assert.match(ui, /mute-1440/);
  assert.match(ui, /kick-room/);
  assert.match(ui, /ban-global/);
  assert.match(ui, /revokeModerationAction/);
  assert.match(actionsMigration, /create table if not exists public\.public_chat_user_moderation_actions/i);
  assert.match(actionsMigration, /auth\.jwt\(\)->'app_metadata'/i);
  assert.doesNotMatch(actionsMigration, /auth\.jwt\(\)->'user_metadata'/i);
  assert.match(actionsMigration, /create or replace function public\.hgd_chat_current_user_restricted/i);
  assert.match(actionsMigration, /not public\.hgd_chat_current_user_restricted\(room_id, array\['ban','mute','kick'\]\)/i);
  assert.match(actionsMigration, /status = 'revoked' and revoked_by = \(select auth\.uid\(\)\)/i);
  assert.match(ui, /سوابق اقدامات نظارتی/);
  assert.match(ui, /لغوشده/);
});

test('moderation-actions migration is additive and does not delete application data', () => {
  assert.match(actionsMigration, /begin;[\s\S]*commit;/i);
  assert.doesNotMatch(actionsMigration, /\b(drop\s+table|truncate\s+table|delete\s+from)\b/i);
});


test('discussion groups enforce a hard three-person ordinary-member cap on the server', () => {
  assert.match(groupCapacityMigration, /create trigger hgd_enforce_discussion_group_capacity_trg/i);
  assert.match(groupCapacityMigration, /for update/i);
  assert.match(groupCapacityMigration, /least\(3, greatest\(1, coalesce\(g\.max_members, 3\)\)\)/i);
  assert.match(groupCapacityMigration, /member_role is distinct from 'discussion_leader'/i);
  assert.match(groupCapacityMigration, /ظرفیت گروه تکمیل است/);
  assert.doesNotMatch(groupCapacityMigration, /\b(drop\s+table|truncate\s+table|delete\s+from)\b/i);
});


test('moderation target guard protects self, admins and moderators; reports cannot target self', () => {
  assert.match(targetGuardMigration, /before insert on public\.public_chat_user_moderation_actions/i);
  assert.match(targetGuardMigration, /new\.user_id = v_actor_id/i);
  assert.match(targetGuardMigration, /raw_app_meta_data/i);
  assert.match(targetGuardMigration, /if v_target_owner and not v_actor_owner/i);
  assert.match(targetGuardMigration, /if v_target_super and not v_actor_owner/i);
  assert.match(targetGuardMigration, /if v_target_admin and not v_actor_owner and not v_actor_super/i);
  assert.match(targetGuardMigration, /reporter_id <> reported_user_id/i);
  assert.match(targetGuardMigration, /create or replace function public\.join_discussion_group/i);
  assert.match(targetGuardMigration, /member_role is distinct from 'discussion_leader'/i);
  assert.match(targetGuardMigration, /ظرفیت گروه تکمیل است؛ مسئول بحث در ظرفیت سه عضو عادی شمرده نمی‌شود/);
  assert.match(targetGuardMigration, /auth\.jwt\(\) -> 'app_metadata'/i);
  assert.doesNotMatch(targetGuardMigration, /auth\.jwt\(\) -> 'user_metadata'/i);
  assert.doesNotMatch(targetGuardMigration, /\b(drop\s+table|truncate\s+table|delete\s+from)\b/i);
});

