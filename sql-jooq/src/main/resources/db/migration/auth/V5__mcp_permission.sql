-- MCP server (Phase 3.F, brief 82): permission to connect an AI agent to My-Trove over MCP.
-- Granted to DEVELOPER, ADMIN and OWNER. Not to MEMBER: the persona table (design 5.2) does not say members may use
-- assistants; add it here when the Trove Assistant (Phase 4.C) is opened to members.
-- Every holder's permissions_version is bumped so tokens minted before this migration are known to be stale.

insert into auth.permissions (name, description) values
    ('mcp:use', 'Connect an AI agent over MCP (tools still need the product permission they read)');

insert into auth.role_permissions (role_name, permission_name) values
    ('DEVELOPER', 'mcp:use'),
    ('ADMIN',     'mcp:use'),
    ('OWNER',     'mcp:use');

update auth.users set permissions_version = permissions_version + 1
    where id in (select user_id from auth.user_roles where role_name in ('DEVELOPER', 'ADMIN', 'OWNER'));
