-- Optional example release row. The download_url is the object path inside the
-- private 'releases' bucket (upload SecureLocalShareSetup-1.0.0.exe there first).
insert into public.releases (version, notes, download_url, is_active, min_version)
values ('v1.0.0', 'Prima release pubblica.', 'SecureLocalShareSetup-1.0.0.exe', true, 'v1.0.0')
on conflict (version) do nothing;
