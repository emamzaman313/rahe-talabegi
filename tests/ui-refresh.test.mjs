import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../src/hamghadam-auth.js', import.meta.url), 'utf8');
test('creator page and creator footer link are removed', () => {
 assert.doesNotMatch(html, /دربارهٔ سازنده|دربارهٔ برنامه|function renderAbout|about:renderAbout/);
 assert.match(html, /class="footer site-footer"/);
 assert.doesNotMatch(html, /data-page="about"/);
});
test('footer is compact and core navigation remains', () => {
 assert.match(html, /هم‌قدم · همراه مسیر یادگیری و مطالعه/);
 assert.match(html, /data-page="home"/);
 assert.match(html, /data-page="settings"/);
});
test('Google sign-in requests account selection', () => {
 assert.match(auth, /ادامه با حساب گوگل/);
 assert.match(auth, /signInWithOAuth\(\{ provider: 'google'/);
 assert.match(auth, /prompt: 'select_account'/);
});
test('email auth and responsive layout remain available', () => {
 assert.match(auth, /signInWithPassword/);
 assert.match(auth, /signInWithOtp/);
 assert.match(auth, /verifyOtp/);
 assert.match(html, /@media\(max-width:640px\)/);
});

test('Google OAuth is available for both sign-in and registration', () => {
 assert.match(auth, /data-hg-action="google"/);
 assert.match(auth, /signInWithOAuth\(\{ provider: 'google'/);
 assert.match(auth, /prompt: 'select_account'/);
 assert.match(auth, /ادامه با حساب گوگل/);
});
