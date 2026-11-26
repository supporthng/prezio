-- Registro de todo lo que hace la cuenta administradora de la base (panel de Supabase, editor SQL, conexiones técnicas).
-- La app no usa este rol para atender a los usuarios, así que solo queda registrado el acceso técnico.
-- (En la base de pruebas local no existe pgaudit: se omite sin error.)
do $$
begin
    if exists (select 1 from pg_available_extensions where name = 'pgaudit') then
        create extension if not exists pgaudit;
        alter role postgres set pgaudit.log to 'read, write, ddl, role';
        alter role postgres set pgaudit.log_relation to 'on';
    end if;
end $$;
