-- pgvector. Created in public so the vector type and its operators resolve for every role regardless of
-- search_path. Needs a role allowed to create extensions (superuser, or trusted-extension privileges).
create extension if not exists vector with schema public;
