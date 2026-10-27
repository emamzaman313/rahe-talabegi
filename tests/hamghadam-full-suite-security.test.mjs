import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261027170000_hamghadam_full_suite.sql'), 'utf8');
const suite = fs.readFileSync(path.join(root, 'src/hamghadam-suite.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src/hamghadam-admin-console.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/hamghadam-admin/index.ts'), 'utf8');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('occasion themes explicitly model birth and martyrdom and are time-window controlled', () => {
  assert.match(migration, /occasion_type in \('birth','martyrdom','religious','national','custom'\)/i);
  assert.match(migration, /starts_at timestamptz not null/i);
  assert.match(migration, /ends_at timestamptz not null/i);
  assert.match(migration, /create policy hgd_occasion_admin_manage[\s\S]*private\.hgd_is_admin\(\)/i);
  assert.match(suite, /selectActiveOccasion/);
  assert.match(admin, /تم‌های مناسبتی شهادت و ولادت/);
});
test('occasion sound is optional and preview is tied to a direct user action', () => {
  assert.match(migration, /sound_key text check \(sound_key is null or sound_key in \('soft-chime','quiet-bell','none'\)\)/i);
  assert.match(suite, /sound_enabled/);
  assert.match(suite, /preview-occasion-sound/);
  assert.doesNotMatch(suite, /\.play\(\)\s*;\s*\/\/ autoplay/);
});
test('discussion groups enforce at most three members and a unique discussion leader', () => {
  assert.match(migration, /max_members smallint not null default 3 check\s*\(max_members=3\)/i);
  assert.match(migration, /one_discussion_leader_per_group/i);
  assert.match(migration, /create or replace function public\.join_discussion_group/i);
  assert.match(migration, /create or replace function public\.assign_discussion_leader/i);
  assert.match(suite, /discussion_leader/);
});
test('full chat has server tables for conversations, members, messages, reactions and polls', () => {
  for (const tableName of ['chat_conversations','chat_members','chat_messages','chat_reactions','chat_invites','chat_polls','chat_poll_options','chat_poll_votes']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${tableName}\\b`, 'i'), `missing ${tableName}`);
    assert.match(migration, new RegExp(`alter table public\\.${tableName} enable row level security`, 'i'), `RLS missing for ${tableName}`);
  }
  assert.match(migration, /create or replace function public\.create_chat_poll/i);
  assert.match(migration, /create or replace function public\.vote_chat_poll/i);
  assert.match(suite, /send-chat-message/);
  assert.match(suite, /vote-chat-poll/);
});
test('private chat policy does not grant blanket access to generic support/content moderators', () => {
  assert.match(migration, /create or replace function private\.hgd_is_chat_moderator\(\)/i);
  assert.match(migration, /create policy hgd_chat_conversations_read[\s\S]*private\.hgd_is_chat_moderator\(\)/i);
  assert.match(migration, /create policy hgd_chat_messages_moderator_update[\s\S]*private\.hgd_is_chat_moderator\(\)/i);
  assert.match(migration, /create policy hgd_chat_messages_read[\s\S]*private\.hgd_is_chat_moderator\(\)/i);
  assert.doesNotMatch(migration.match(/create or replace function private\.hgd_can_read_chat[\s\S]*?\$\$;/i)?.[0] || '', /private\.hgd_is_moderator\(\)/i);
});

test('50 MiB chat and 100 MiB personal-book caps are applied in Storage and metadata', () => {
  assert.match(migration, /hamghadam-conversation-files','hamghadam-conversation-files',false,52428800/i);
  assert.match(migration, /hamghadam-personal-books','hamghadam-personal-books',false,104857600/i);
  assert.match(migration, /size_bytes<=104857600/i);
  assert.match(suite, /HGD_FILE_LIMITS\.chatBytes/);
  assert.match(suite, /HGD_FILE_LIMITS\.personalBookBytes/);
});
test('reports carry reason, status, moderator notes and resolution state under RLS', () => {
  assert.match(migration, /create table if not exists public\.community_reports/i);
  assert.match(migration, /internal_note text not null/i);
  assert.match(migration, /resolved_by uuid/i);
  assert.match(migration, /create policy hgd_reports_moderator_update[\s\S]*private\.hgd_is_moderator\(\)/i);
  assert.match(admin, /رسیدگی به گزارش/);
});
test('administrator console and privileged API use trusted app_metadata, not user_metadata', () => {
  assert.match(edge, /auth\.getUser\(token\)/);
  assert.match(edge, /actor\.app_metadata/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(admin, /SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]/i);
  assert.doesNotMatch(suite, /SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]/i);
  assert.match(html, /src="\.\/src\/hamghadam-admin-console\.js"/);
});
test('server-side quiz RPC hides answer grading in the database and returns a graded result', () => {
  assert.match(migration, /create or replace function public\.get_public_quiz/i);
  assert.match(migration, /create or replace function public\.submit_hamghadam_quiz_answer/i);
  assert.match(suite, /supabase\.rpc\('submit_hamghadam_quiz_answer'/);
  assert.match(migration, /hamghadam_point_ledger/i);
});
test('personal book and review records are owner-scoped and RLS protected', () => {
  assert.match(migration, /create table if not exists public\.personal_books/i);
  assert.match(migration, /create policy hgd_personal_books_own[\s\S]*user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /create table if not exists public\.flashcard_reviews/i);
  assert.match(migration, /alter table public\.flashcards enable row level security/i);
  assert.match(suite, /createSignedUrl/);
});
test('feature settings are server-backed and admin mutation supports audit logging', () => {
  assert.match(migration, /create table if not exists public\.app_settings/i);
  assert.match(migration, /create table if not exists public\.admin_audit_logs/i);
  assert.match(edge, /admin_audit_logs/);
  assert.match(admin, /save-features/);
  assert.match(suite, /app_settings/);
});
test('no public permanent storage URL is hardcoded for private uploads', () => {
  assert.doesNotMatch(suite, /storage\/v1\/object\/public/);
  assert.match(suite, /createSignedUrl\(/);
  assert.match(migration, /insert into storage\.buckets[\s\S]*false,52428800/i);
  assert.match(migration, /insert into storage\.buckets[\s\S]*false,104857600/i);
});

test('private-chat and community-chat feature flags are checked independently', () => {
  assert.match(suite, /tab==='chats' && !featureEnabled\('community_chat'\) && !featureEnabled\('private_chat'\)/);
  assert.match(suite, /const directCreate=allowPrivate\?/);
  assert.match(suite, /const communityCreate=allowCommunity\?/);
});

test('occasion theme UI never autoplays sound and offers a full opt-out', () => {
  assert.match(suite, /disable_occasion_themes/);
  assert.match(suite, /preview-occasion-sound/);
  assert.match(suite, /sound_enabled/);
  assert.doesNotMatch(suite, /\.play\(\)\s*;\s*\/\* auto/i);
});
