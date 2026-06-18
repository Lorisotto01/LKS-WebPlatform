-- ============================================================================
-- Fase 7 — Auto-update from the desktop app (anonymous, public key only).
-- The app makes a single unauthenticated GET to read the active release, and
-- requests a short-lived signed URL to download the .exe. These policies expose
-- ONLY active releases to the `anon` role and allow signed-URL creation on the
-- private `releases` bucket. The web Dashboard (authenticated) is unaffected.
-- ============================================================================

-- Active releases readable by the anon role (desktop update check).
drop policy if exists releases_select_anon_active on public.releases;
create policy releases_select_anon_active on public.releases
    for select to anon
    using (is_active = true);

-- Allow the anon role to create signed URLs for objects in the private bucket
-- (createSignedUrl requires a SELECT grant on the object). Objects remain private:
-- access is only ever via a time-limited signed URL, never a public link.
drop policy if exists releases_objects_read_anon on storage.objects;
create policy releases_objects_read_anon on storage.objects
    for select to anon
    using (bucket_id = 'releases');
