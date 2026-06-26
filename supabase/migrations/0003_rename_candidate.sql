-- ExamCert Platform — rename the non-admin role from 'student' to 'candidate'
-- Run once in the Supabase SQL editor.
alter type user_role rename value 'student' to 'candidate';
alter table public.profiles alter column role set default 'candidate';
